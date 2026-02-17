import tensorflow as tf

model = tf.keras.models.load_model("models/plant_disease_model.h5")

print("Input shape:", model.input_shape)
print("Output shape:", model.output_shape)
