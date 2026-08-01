import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors, fontSize, radius, spacing } from '../theme';
import { Banner } from './Feedback';

interface CameraModalProps {
  visible: boolean;
  onCapture: (uri: string) => void;
  onClose: () => void;
}

export function CameraModal({ visible, onCapture, onClose }: CameraModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);

  const handleCapture = async () => {
    if (!cameraRef.current) {
      return;
    }
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.6 });
      if (photo) {
        onCapture(photo.uri);
      }
    } catch (error) {
      console.warn('Camera capture failed', error);
    } finally {
      setCapturing(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {permission?.granted ? (
          <CameraView
            style={styles.camera}
            facing="front"
            ref={cameraRef}
            onCameraReady={() => setCameraReady(true)}
          />
        ) : (
          <View style={styles.permissionBox}>
            <Banner
              kind="warning"
              title="Camera permission needed"
              detail="Time-in and time-out require a selfie photo for face verification."
            />
            <TouchableOpacity style={styles.grantButton} onPress={requestPermission}>
              <Text style={styles.grantLabel}>Grant camera permission</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.controls}>
          {permission?.granted && (
            <TouchableOpacity
              style={[styles.captureButton, (capturing || !cameraReady) && styles.captureButtonDisabled]}
              disabled={capturing || !cameraReady}
              onPress={handleCapture}
            >
              {capturing ? <ActivityIndicator color={colors.white} /> : <View style={styles.captureInner} />}
            </TouchableOpacity>
          )}
          <Pressable style={styles.closeButton} onPress={onClose} hitSlop={8}>
            <Text style={styles.closeText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  permissionBox: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  grantButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
  },
  grantLabel: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  controls: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButtonDisabled: {
    opacity: 0.6,
  },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.white,
  },
  closeButton: {
    marginTop: spacing.lg,
    paddingVertical: 8,
    paddingHorizontal: 24,
  },
  closeText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
