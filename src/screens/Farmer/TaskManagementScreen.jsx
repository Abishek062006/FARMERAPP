import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import axios from 'axios';
import { API_ENDPOINTS } from '../../utils/config';

export default function TaskManagementScreen({ navigation, route }) {
  const { crop, userData } = route.params || {};
  
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  // Form fields
  const [taskDate, setTaskDate] = useState(new Date());
  const [taskType, setTaskType] = useState('watering');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [estimatedTime, setEstimatedTime] = useState('30');

  const firebaseUid = userData?.firebaseUid || userData?.uid;

  const taskTypes = [
    { value: 'watering', label: 'Watering (நீர்ப்பாசனம்)' },
    { value: 'fertilizing', label: 'Fertilizing (உரமிடுதல்)' },
    { value: 'weeding', label: 'Weeding (களை எடுத்தல்)' },
    { value: 'pruning', label: 'Pruning (கத்தரித்தல்)' },
    { value: 'pest-control', label: 'Pest Control (பூச்சி கட்டுப்பாடு)' },
    { value: 'harvesting', label: 'Harvesting (அறுவடை)' },
    { value: 'monitoring', label: 'Monitoring (கண்காணிப்பு)' },
    { value: 'other', label: 'Other (மற்றவை)' },
  ];

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const response = await axios.get(`${API_ENDPOINTS.TASKS}/crop/${crop._id}`);
      if (response.data.success) {
        setTasks(response.data.tasks);
      }
    } catch (error) {
      console.error('❌ Error fetching tasks:', error);
    }
  };

  const handleCreateTask = async () => {
    if (!title.trim()) {
      Alert.alert('Required', 'Please enter task title');
      return;
    }

    try {
      setLoading(true);

      const taskData = {
        cropId: crop._id,
        firebaseUid,
        day: Math.floor((taskDate - new Date(crop.plantingDate)) / (1000 * 60 * 60 * 24)) + 1,
        date: taskDate.toISOString(),
        taskType,
        title: title.trim(),
        titleTamil: '',
        description: description.trim(),
        descriptionTamil: '',
        priority,
        estimatedTime: parseInt(estimatedTime),
        weatherConsiderations: '',
        isAIGenerated: false,
      };

      const response = await axios.post(API_ENDPOINTS.TASKS, taskData);

      if (response.data.success) {
        Alert.alert('Success', 'Task created successfully!');
        setShowModal(false);
        resetForm();
        fetchTasks();
      }
    } catch (error) {
      console.error('❌ Error creating task:', error);
      Alert.alert('Error', 'Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleComplete = async (taskId, currentStatus) => {
    try {
      const response = await axios.put(`${API_ENDPOINTS.TASKS}/${taskId}/complete`, {
        notes: '',
      });

      if (response.data.success) {
        fetchTasks();
      }
    } catch (error) {
      console.error('❌ Error updating task:', error);
      Alert.alert('Error', 'Failed to update task');
    }
  };

  const handleDeleteTask = (taskId) => {
    Alert.alert(
      'Delete Task',
      'Are you sure you want to delete this task?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${API_ENDPOINTS.TASKS}/${taskId}`);
              fetchTasks();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete task');
            }
          },
        },
      ]
    );
  };

  const resetForm = () => {
    setTaskDate(new Date());
    setTaskType('watering');
    setTitle('');
    setDescription('');
    setPriority('medium');
    setEstimatedTime('30');
  };

  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setTaskDate(selectedDate);
    }
  };

  const renderTaskItem = ({ item }) => {
    const isOverdue = !item.isCompleted && new Date(item.date) < new Date();

    return (
      <View style={[styles.taskCard, item.isCompleted && styles.taskCardCompleted]}>
        <TouchableOpacity
          style={styles.checkboxContainer}
          onPress={() => handleToggleComplete(item._id, item.isCompleted)}
        >
          <Ionicons
            name={item.isCompleted ? 'checkmark-circle' : 'radio-button-off'}
            size={28}
            color={item.isCompleted ? '#4CAF50' : '#ccc'}
          />
        </TouchableOpacity>

        <View style={styles.taskContent}>
          <Text style={[styles.taskTitle, item.isCompleted && styles.taskTitleCompleted]}>
            {item.title}
          </Text>
          {item.description && (
            <Text style={styles.taskDescription}>{item.description}</Text>
          )}
          <View style={styles.taskMeta}>
            <View style={styles.taskMetaItem}>
              <Ionicons name="calendar" size={14} color="#666" />
              <Text style={styles.taskMetaText}>
                {new Date(item.date).toLocaleDateString('en-IN')}
              </Text>
            </View>
            <View style={styles.taskMetaItem}>
              <Ionicons name="time" size={14} color="#666" />
              <Text style={styles.taskMetaText}>{item.estimatedTime} mins</Text>
            </View>
            {isOverdue && (
              <View style={[styles.taskMetaItem, styles.overdueItem]}>
                <Ionicons name="warning" size={14} color="#F44336" />
                <Text style={styles.overdueText}>Overdue</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.taskActions}>
          <View style={[
            styles.priorityBadge,
            item.priority === 'high' && styles.priorityHigh,
            item.priority === 'medium' && styles.priorityMedium,
            item.priority === 'low' && styles.priorityLow,
          ]}>
            <Text style={styles.priorityText}>{item.priority}</Text>
          </View>
          <TouchableOpacity onPress={() => handleDeleteTask(item._id)}>
            <Ionicons name="trash-outline" size={20} color="#F44336" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tasks for {crop.name}</Text>
        <Text style={styles.headerSubtitle}>
          {tasks.filter(t => !t.isCompleted).length} pending tasks
        </Text>
      </View>

      {/* Task List */}
      {tasks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="clipboard-outline" size={60} color="#ccc" />
          <Text style={styles.emptyText}>No tasks yet</Text>
          <Text style={styles.emptySubtext}>Create your first task to get started</Text>
        </View>
      ) : (
        <FlatList
          data={tasks}
          renderItem={renderTaskItem}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Add Task Button */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Create Task Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create New Task</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={28} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              {/* Task Type */}
              <Text style={styles.label}>Task Type</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={taskType}
                  onValueChange={setTaskType}
                  style={styles.picker}
                >
                  {taskTypes.map((type) => (
                    <Picker.Item key={type.value} label={type.label} value={type.value} />
                  ))}
                </Picker>
              </View>

              {/* Title */}
              <Text style={styles.label}>Title *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Water the plants"
                value={title}
                onChangeText={setTitle}
              />

              {/* Description */}
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Add details..."
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
              />

              {/* Date */}
              <Text style={styles.label}>Date</Text>
              <TouchableOpacity
                style={styles.dateButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons name="calendar" size={20} color="#4CAF50" />
                <Text style={styles.dateText}>
                  {taskDate.toLocaleDateString('en-IN')}
                </Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={taskDate}
                  mode="date"
                  display="default"
                  onChange={handleDateChange}
                />
              )}

              {/* Priority */}
              <Text style={styles.label}>Priority</Text>
              <View style={styles.priorityButtons}>
                {['low', 'medium', 'high'].map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.priorityButton,
                      priority === p && styles.priorityButtonActive,
                    ]}
                    onPress={() => setPriority(p)}
                  >
                    <Text
                      style={[
                        styles.priorityButtonText,
                        priority === p && styles.priorityButtonTextActive,
                      ]}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Estimated Time */}
              <Text style={styles.label}>Estimated Time (minutes)</Text>
              <TextInput
                style={styles.input}
                placeholder="30"
                keyboardType="numeric"
                value={estimatedTime}
                onChangeText={setEstimatedTime}
              />
            </ScrollView>

            {/* Create Button */}
            <TouchableOpacity
              style={styles.createButton}
              onPress={handleCreateTask}
              disabled={loading}
            >
              <Text style={styles.createButtonText}>
                {loading ? 'Creating...' : 'Create Task'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  listContent: {
    padding: 16,
  },
  taskCard: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  taskCardCompleted: {
    opacity: 0.6,
  },
  checkboxContainer: {
    marginRight: 12,
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  taskDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  taskMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  taskMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  taskMetaText: {
    fontSize: 12,
    color: '#666',
  },
  overdueItem: {
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  overdueText: {
    fontSize: 12,
    color: '#F44336',
    fontWeight: 'bold',
  },
  taskActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priorityHigh: {
    backgroundColor: '#FFEBEE',
  },
  priorityMedium: {
    backgroundColor: '#FFF3E0',
  },
  priorityLow: {
    backgroundColor: '#E8F5E9',
  },
  priorityText: {
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  modalForm: {
    padding: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  pickerContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  dateText: {
    fontSize: 16,
    color: '#333',
  },
  priorityButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  priorityButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  priorityButtonActive: {
    borderColor: '#4CAF50',
    backgroundColor: '#E8F5E9',
  },
  priorityButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  priorityButtonTextActive: {
    color: '#4CAF50',
  },
  createButton: {
    backgroundColor: '#4CAF50',
    padding: 16,
    margin: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
