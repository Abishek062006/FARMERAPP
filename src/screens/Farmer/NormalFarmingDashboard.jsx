import React from 'react';
import { View, Text, StyleSheet, StatusBar } from 'react-native';
import { COLORS } from '../../constants/colors';

const NormalFarmingDashboard = () => {
  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.icon}>🚜</Text>
          <Text style={styles.title}>Normal Farming</Text>
          <Text style={styles.subtitle}>AI System Dashboard</Text>
        </View>

        <View style={styles.content}>
          <View style={styles.card}>
            <Text style={styles.cardText}>
              AI Integration Coming in Week 2-3
            </Text>
            <Text style={styles.cardSubtext}>
              • Crop Recommendations {'\n'}
              • Weather Predictions {'\n'}
              • Yield Estimation
            </Text>
          </View>
        </View>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.secondary,
    paddingTop: 60,
    paddingBottom: 40,
    alignItems: 'center',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  icon: {
    fontSize: 60,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.primary,
    marginTop: 8,
    opacity: 0.8,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: COLORS.cardBackground,
    padding: 32,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  cardText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  cardSubtext: {
    fontSize: 16,
    color: COLORS.textLight,
    lineHeight: 28,
  },
});

export default NormalFarmingDashboard;
