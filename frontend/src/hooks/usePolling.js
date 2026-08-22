import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Repeatedly calls `fn` while the screen is focused AND the app is in the
 * foreground.
 *
 * This app has no push notifications and no websockets — expo-notifications
 * isn't installed and remote push doesn't work in Expo Go regardless — so the
 * marketplace's near-realtime bits (an agent watching for jobs, a vendor
 * watching a delivery move) have to poll. Before this hook there was no
 * setInterval anywhere in the frontend; data refresh was mount-effect plus
 * RefreshControl. This is the one new abstraction, shared by three screens,
 * rather than three hand-rolled intervals that each forget a teardown case.
 *
 * Three things it handles that a bare setInterval doesn't:
 *   - stops when the screen loses focus (navigating away)
 *   - stops when the app is backgrounded, and fires once immediately on
 *     return, so a user coming back to the app doesn't stare at stale data
 *     for a full interval
 *   - never lets a slow request stack: if the previous call hasn't settled,
 *     the tick is skipped instead of queuing another in-flight request
 *
 * `fn` is held in a ref, so an inline arrow function is fine — the interval
 * is not torn down and rebuilt on every parent render.
 *
 *   usePolling(fetchJobs, 5000, isOnline);
 */
export default function usePolling(fn, intervalMs, enabled = true) {
  const fnRef = useRef(fn);
  const inFlight = useRef(false);
  const timer = useRef(null);
  const focused = useRef(false);

  useEffect(() => { fnRef.current = fn; }, [fn]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;

      const run = async () => {
        if (inFlight.current) return;      // previous tick still running — skip
        inFlight.current = true;
        try {
          await fnRef.current();
        } catch (err) {
          // A dropped poll is normal on mobile data. Log, keep polling —
          // never surface an Alert from a background refresh.
          console.log('⏱️ poll failed:', err?.message || err);
        } finally {
          inFlight.current = false;
        }
      };

      const start = () => {
        if (timer.current || !enabled) return;
        run();                              // fire immediately, then on interval
        timer.current = setInterval(run, intervalMs);
      };

      const stop = () => {
        if (timer.current) {
          clearInterval(timer.current);
          timer.current = null;
        }
      };

      if (enabled) start();

      const sub = AppState.addEventListener('change', (state) => {
        if (!focused.current || !enabled) return;
        if (state === 'active') start();
        else stop();
      });

      return () => {
        focused.current = false;
        stop();
        sub.remove();
      };
    }, [intervalMs, enabled])
  );
}
