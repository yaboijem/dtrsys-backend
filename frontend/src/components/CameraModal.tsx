import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fontSize, microLabel, radius, spacing, useThemeColors } from '../theme';
import { Banner } from './Feedback';

interface CameraModalProps {
  visible: boolean;
  onCapture: (uri: string) => void;
  onClose: () => void;
}

export function CameraModal({ visible, onCapture, onClose }: CameraModalProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
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
      <View style={[styles.container, { backgroundColor: colors.cameraChrome }]}>
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
            <TouchableOpacity
              style={[styles.grantButton, { backgroundColor: colors.band }]}
              onPress={requestPermission}
              accessibilityRole="button"
              accessibilityLabel="Grant camera permission"
            >
              <Text style={[styles.grantLabel, { color: colors.bandText }]}>Grant camera permission</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.topBar, { paddingTop: insets.top + spacing.md }]}>
          <Text style={[microLabel, { color: '#ffffff' }]}>Capture selfie</Text>
        </View>

        <View style={[styles.controls, { bottom: insets.bottom + spacing.xl }]}>
          {permission?.granted && (
            <TouchableOpacity
              style={[
                styles.captureButton,
                (capturing || !cameraReady) && { opacity: 0.5 },
              ]}
              disabled={capturing || !cameraReady}
              onPress={handleCapture}
              accessibilityRole="button"
              accessibilityLabel="Take photo"
            >
              {capturing ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <View style={[styles.captureInner, { backgroundColor: '#ffffff' }]} />
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel capture"
          >
            <Text style={styles.closeText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  grantLabel: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  closeButton: {
    marginTop: spacing.md,
    minHeight: 44,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: '#ffffff',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
