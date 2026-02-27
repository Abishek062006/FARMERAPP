import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  PermissionsAndroid,
  Image,
} from 'react-native';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';

const OPENROUTER_API_KEY = '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';

const FARMER_IMAGE = require('../../assets/uzhavan.png');

const isTamilText = (text) => /[\u0B80-\u0BFF]/.test(text);

const UzhavanChatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: '1',
      role: 'assistant',
      content:
        'வணக்கம்! நான் உழவன். கேள்விகளை தட்டச்சு செய்யலாம் அல்லது மைக் அழுத்தி பேசலாம்!\n\nHello! I am Uzhavan. You can type your question or press the mic and speak!',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingId, setSpeakingId] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingInstance, setRecordingInstance] = useState(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const micAnim = useRef(new Animated.Value(1)).current;
  const flatListRef = useRef(null);

  // Pulse animation for floating button
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.12, duration: 900, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // Pulse animation for mic when recording
  useEffect(() => {
    if (isRecording) {
      const micPulse = Animated.loop(
        Animated.sequence([
          Animated.timing(micAnim, { toValue: 1.3, duration: 500, useNativeDriver: true }),
          Animated.timing(micAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      micPulse.start();
      return () => micPulse.stop();
    } else {
      micAnim.setValue(1);
    }
  }, [isRecording]);

  // ── Send message to OpenRouter ──
  const sendToBot = async (messageText) => {
    if (!messageText.trim()) return;

    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText.trim(),
    };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://uzhavan-farmer-app.com',
          'X-Title': 'UZHAVAN Farmer Assistant',
        },
        body: JSON.stringify({
          model: 'mistralai/mistral-saba',
          messages: [
            {
              role: 'system',
              content: `You are UZHAVAN (உழவன்), an expert AI farming assistant for Tamil Nadu farmers in India.
You are knowledgeable about:
- Crop diseases, pest control, fertilizers, organic farming
- Paddy, sugarcane, banana, mango, tomato, groundnut, cotton and all Tamil Nadu crops
- Tamil Nadu government schemes, PM-KISAN, subsidies and farmer loans
- Irrigation methods, soil health, weather-based farming decisions
- Market prices, crop selling advice and storage tips

STRICT LANGUAGE RULE:
- If the farmer writes or speaks in Tamil script reply ONLY in Tamil
- If the farmer writes or speaks in English reply ONLY in English
- If mixed language reply in both Tamil and English
- Keep answers simple, practical, and easy for farmers to understand
- Use numbered steps for procedures and treatments`,
            },
            ...updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          ],
          temperature: 0.7,
          max_tokens: 500,
        }),
      });

      const data = await response.json();
      const botReply =
        data.choices?.[0]?.message?.content ||
        'மன்னிக்கவும், மீண்டும் முயற்சிக்கவும். / Sorry, please try again.';

      const botMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: botReply,
      };

      setMessages((prev) => [...prev, botMsg]);
      autoSpeak(botReply, botMsg.id);

    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'இணைப்பு பிழை. மீண்டும் முயற்சிக்கவும். / Connection error. Please try again.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Auto speak bot reply ──
  const autoSpeak = (text, messageId) => {
    Speech.stop();
    const lang = isTamilText(text) ? 'ta-IN' : 'en-IN';
    setIsSpeaking(true);
    setSpeakingId(messageId);
    Speech.speak(text, {
      language: lang,
      rate: 0.85,
      pitch: 1.0,
      onDone: () => { setIsSpeaking(false); setSpeakingId(null); },
      onError: () => { setIsSpeaking(false); setSpeakingId(null); },
    });
  };

  // ── Manual speak toggle ──
  const speakMessage = (text, messageId) => {
    if (isSpeaking && speakingId === messageId) {
      Speech.stop();
      setIsSpeaking(false);
      setSpeakingId(null);
      return;
    }
    autoSpeak(text, messageId);
  };

  // ── Mic permission ──
  const requestMicPermission = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Permission',
          message: 'UZHAVAN needs microphone access to understand your voice.',
          buttonPositive: 'Allow',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    const { status } = await Audio.requestPermissionsAsync();
    return status === 'granted';
  };

  // ── Start Recording ──
  const startRecording = async () => {
    try {
      const hasPermission = await requestMicPermission();
      if (!hasPermission) {
        alert('Microphone permission is needed for voice input.');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecordingInstance(recording);
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  };

  // ── Stop Recording and Transcribe ──
  const stopRecording = async () => {
    if (!recordingInstance) return;
    try {
      setIsRecording(false);
      setIsTranscribing(true);
      await recordingInstance.stopAndUnloadAsync();
      const uri = recordingInstance.getURI();
      setRecordingInstance(null);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      const formData = new FormData();
      formData.append('file', { uri, type: 'audio/m4a', name: 'voice_input.m4a' });
      formData.append('model', 'openai/whisper-large-v3');

      const whisperResponse = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}` },
        body: formData,
      });

      if (whisperResponse.ok) {
        const whisperData = await whisperResponse.json();
        const transcribedText = whisperData.text?.trim();
        if (transcribedText) {
          setInput(transcribedText);
          setIsTranscribing(false);
          await sendToBot(transcribedText);
          return;
        }
      }

      setIsTranscribing(false);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: 'குரல் புரியவில்லை. மீண்டும் முயற்சிக்கவும். / Could not understand voice. Please try again or type.',
        },
      ]);
    } catch (err) {
      console.error('Transcription error:', err);
      setIsTranscribing(false);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: 'குரல் பதிவு பிழை. / Voice recording error. Please type instead.',
        },
      ]);
    }
  };

  const handleMicPress = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  const handleSend = () => {
    if (input.trim()) sendToBot(input);
  };

  const renderMessage = ({ item }) => {
    const isUser = item.role === 'user';
    const isThisSpeaking = isSpeaking && speakingId === item.id;

    return (
      <View style={isUser ? styles.userRow : styles.botRow}>
        {!isUser && (
          <View style={styles.botAvatar}>
            <Image
              source={FARMER_IMAGE}
              style={styles.botAvatarImage}
              resizeMode="cover"
            />
          </View>
        )}
        <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.botBubble]}>
          {item.isVoice && (
            <View style={styles.voiceTag}>
              <Text style={styles.voiceTagText}>{'🎤 Voice'}</Text>
            </View>
          )}
          <Text style={[styles.messageText, isUser ? styles.userText : styles.botText]}>
            {item.content}
          </Text>
          {!isUser && (
            <TouchableOpacity
              onPress={() => speakMessage(item.content, item.id)}
              style={styles.speakButton}
              activeOpacity={0.7}
            >
              <Text style={styles.speakButtonText}>
                {isThisSpeaking ? '⏹ நிறுத்து / Stop' : '🔊 கேளு / Listen'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <>
      {/* ── Floating Button ── */}
      <Animated.View style={[styles.floatingWrapper, { transform: [{ scale: scaleAnim }] }]}>
        <TouchableOpacity
          style={styles.floatingButton}
          onPress={() => setIsOpen(true)}
          activeOpacity={0.85}
        >
          <Image
            source={FARMER_IMAGE}
            style={styles.floatingImage}
            resizeMode="cover"
          />
          <Text style={styles.floatingLabel}>{'உழவன்'}</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* ── Chat Modal ── */}
      <Modal
        visible={isOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.chatContainer}>

            {/* Header */}
            <View style={styles.chatHeader}>
              <View style={styles.headerLeft}>
                <Image
                  source={FARMER_IMAGE}
                  style={styles.headerImage}
                  resizeMode="cover"
                />
                <View style={styles.headerTextCol}>
                  <Text style={styles.headerTitle}>{'UZHAVAN - உழவன்'}</Text>
                  <Text style={styles.headerSubtitle}>{'Type or Speak • Tamil & English'}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setIsOpen(false)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>{'✕'}</Text>
              </TouchableOpacity>
            </View>

            {/* Messages */}
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={renderMessage}
              contentContainerStyle={styles.messagesList}
              onContentSizeChange={() =>
                flatListRef.current?.scrollToEnd({ animated: true })
              }
              showsVerticalScrollIndicator={false}
            />

            {/* Status Indicators */}
            {isTranscribing && (
              <View style={styles.statusBar}>
                <ActivityIndicator size="small" color="#1B5E20" />
                <Text style={styles.statusText}>{'குரலை புரிந்துகொள்கிறேன்... / Understanding voice...'}</Text>
              </View>
            )}
            {isLoading && !isTranscribing && (
              <View style={styles.statusBar}>
                <ActivityIndicator size="small" color="#1B5E20" />
                <Text style={styles.statusText}>{'உழவன் யோசிக்கிறான்...'}</Text>
              </View>
            )}
            {isRecording && (
              <View style={styles.recordingBar}>
                <Animated.View
                  style={[styles.recordingDot, { transform: [{ scale: micAnim }] }]}
                />
                <Text style={styles.recordingText}>{'🎤 பேசுங்கள்... / Speak now...'}</Text>
                <Text style={styles.recordingHint}>{'Tap mic again to stop'}</Text>
              </View>
            )}

            {/* Input Area */}
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.textInput}
                value={input}
                onChangeText={setInput}
                placeholder="Type in Tamil or English..."
                placeholderTextColor="#aaa"
                multiline
                maxLength={300}
              />

              {/* Mic Button */}
              <Animated.View style={{ transform: [{ scale: micAnim }] }}>
                <TouchableOpacity
                  style={[styles.micButton, isRecording && styles.micButtonActive]}
                  onPress={handleMicPress}
                  disabled={isLoading || isTranscribing}
                  activeOpacity={0.8}
                >
                  <Text style={styles.micIcon}>{isRecording ? '⏹' : '🎤'}</Text>
                </TouchableOpacity>
              </Animated.View>

              {/* Send Button */}
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  (!input.trim() || isLoading) && styles.sendButtonDisabled,
                ]}
                onPress={handleSend}
                disabled={!input.trim() || isLoading}
                activeOpacity={0.8}
              >
                <Text style={styles.sendButtonText}>{'➤'}</Text>
              </TouchableOpacity>
            </View>

          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({

  // ── Floating Button ──
  floatingWrapper: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    zIndex: 9999,
    elevation: 10,
  },
  floatingButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#1B5E20',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    overflow: 'hidden',
    paddingTop: 4,
  },
  floatingImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  floatingLabel: {
    color: '#fff',
    fontSize: 9,
    fontWeight: 'bold',
    marginTop: 2,
  },

  // ── Modal ──
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  chatContainer: {
    height: '85%',
    backgroundColor: '#F1F8E9',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },

  // ── Header ──
  chatHeader: {
    backgroundColor: '#1B5E20',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  headerTextCol: {
    flexDirection: 'column',
    marginLeft: 10,
  },
  headerTitle: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  headerSubtitle: {
    color: '#fff',
    fontSize: 11,
    opacity: 0.8,
    marginTop: 1,
  },
  closeButton: { padding: 6 },
  closeButtonText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },

  // ── Messages ──
  messagesList: { padding: 12, paddingBottom: 6 },
  userRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginVertical: 5,
    alignItems: 'flex-end',
  },
  botRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginVertical: 5,
    alignItems: 'flex-end',
  },
  botAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1B5E20',
    marginRight: 6,
    overflow: 'hidden',
  },
  botAvatarImage: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 10,
    borderRadius: 14,
    elevation: 1,
  },
  userBubble: {
    backgroundColor: '#1B5E20',
    borderBottomRightRadius: 4,
  },
  botBubble: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 4,
  },
  messageText: { fontSize: 13, lineHeight: 20 },
  userText: { color: '#fff' },
  botText: { color: '#333' },
  voiceTag: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  voiceTagText: { fontSize: 10, color: '#fff' },
  speakButton: {
    marginTop: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#2E7D32',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  speakButtonText: {
    fontSize: 11,
    color: '#1B5E20',
    fontWeight: '600',
  },

  // ── Status Bars ──
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#E8F5E9',
  },
  statusText: {
    fontSize: 12,
    color: '#1B5E20',
    marginLeft: 8,
  },
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FEF2F2',
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#DC2626',
    marginRight: 8,
  },
  recordingText: {
    fontSize: 13,
    color: '#DC2626',
    fontWeight: '600',
    flex: 1,
  },
  recordingHint: { fontSize: 10, color: '#9CA3AF' },

  // ── Input ──
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#A5D6A7',
    backgroundColor: '#fff',
    alignItems: 'flex-end',
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2E7D32',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    maxHeight: 80,
    color: '#333',
    backgroundColor: '#F1F8E9',
    marginRight: 8,
  },
  micButton: {
    backgroundColor: '#C8E6C9',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  micButtonActive: {
    backgroundColor: '#FEE2E2',
  },
  micIcon: { fontSize: 20 },
  sendButton: {
    backgroundColor: '#1B5E20',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.35 },
  sendButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});

export default UzhavanChatbot;
