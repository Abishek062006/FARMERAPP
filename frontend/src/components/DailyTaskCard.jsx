import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { API_ENDPOINTS } from '../utils/config';

const TASK_TYPE_META = {
  watering: { icon: 'water', color: '#3B9FE0' },
  fertilizing: { icon: 'nutrition', color: '#8D6E4A' },
  pestControl: { icon: 'bug', color: '#E4432A' },
  observation: { icon: 'eye', color: '#7B7B7B' },
};

function TaskRow({ task, onCompleted }) {
  const [completing, setCompleting] = useState(false);
  const meta = TASK_TYPE_META[task.taskType] || { icon: 'checkmark-circle', color: '#4CAF50' };

  const handleComplete = async () => {
    try {
      setCompleting(true);
      await axios.put(`${API_ENDPOINTS.TASKS}/${task._id}/complete`, { notes: '' });
      onCompleted(task._id);
    } catch (error) {
      console.error('❌ Error completing task:', error);
      Alert.alert('Error', 'Failed to mark task complete. Please try again.');
    } finally {
      setCompleting(false);
    }
  };

  return (
    <View style={[styles.taskRow, task.isCompleted && styles.taskRowDone]}>
      <View style={[styles.taskIcon, { backgroundColor: `${meta.color}20` }]}>
        <Ionicons name={meta.icon} size={18} color={meta.color} />
      </View>
      <View style={styles.taskContent}>
        <Text style={[styles.taskTitle, task.isCompleted && styles.taskTitleDone]}>{task.title}</Text>
        {task.titleTamil ? <Text style={styles.taskTitleTamil}>{task.titleTamil}</Text> : null}
        <Text style={styles.taskDescription}>{task.description}</Text>
        {task.weatherConsiderations ? (
          <View style={styles.weatherNote}>
            <Ionicons name="rainy-outline" size={13} color="#3B9FE0" />
            <Text style={styles.weatherNoteText}>{task.weatherConsiderations}</Text>
          </View>
        ) : null}
        {task.priority === 'high' && !task.isCompleted && (
          <View style={styles.priorityBadge}>
            <Text style={styles.priorityBadgeText}>Priority</Text>
          </View>
        )}
      </View>
      <TouchableOpacity
        style={[styles.completeButton, task.isCompleted && styles.completeButtonDone]}
        onPress={handleComplete}
        disabled={task.isCompleted || completing}
      >
        {completing ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name={task.isCompleted ? 'checkmark' : 'ellipse-outline'} size={20} color="#fff" />
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function DailyTaskCard({ day, stage, phase, tasks, message, onTaskCompleted }) {
  const stageLabel = stage ? stage.charAt(0).toUpperCase() + stage.slice(1) : '';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.dayBadge}>Day {day}</Text>
        <Text style={styles.stageBadge}>{stageLabel}{phase === 'maintenance' ? ' · Maintenance' : ''}</Text>
      </View>

      {tasks.length === 0 ? (
        <Text style={styles.emptyText}>
          {message || 'Nothing scheduled for today — check back tomorrow.'}
        </Text>
      ) : (
        tasks.map((task) => (
          <TaskRow key={task._id} task={task} onCompleted={onTaskCompleted} />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dayBadge: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  stageBadge: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4CAF50',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    paddingVertical: 12,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  taskRowDone: {
    opacity: 0.55,
  },
  taskIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  taskTitleDone: {
    textDecorationLine: 'line-through',
  },
  taskTitleTamil: {
    fontSize: 13,
    color: '#666',
    marginTop: 1,
  },
  taskDescription: {
    fontSize: 13,
    color: '#666',
    marginTop: 3,
    lineHeight: 18,
  },
  weatherNote: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  weatherNoteText: {
    fontSize: 12,
    color: '#3B9FE0',
    marginLeft: 4,
    flex: 1,
  },
  priorityBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 4,
  },
  priorityBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E4432A',
  },
  completeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  completeButtonDone: {
    backgroundColor: '#9E9E9E',
  },
});
