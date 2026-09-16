import { useCallback, useEffect, useState } from 'react';

import {
  fileToProfilePhotoDataUrl,
  getProfilePhoto,
  removeProfilePhoto,
  setProfilePhoto,
  subscribeProfilePhoto,
} from './profilePhoto';

export function useProfilePhoto(employeeId: string | null | undefined) {
  const id = employeeId ?? '';
  const [src, setSrc] = useState<string | null>(() => (id ? getProfilePhoto(id) : null));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSrc(id ? getProfilePhoto(id) : null);
    setError(null);
    if (!id) return;
    return subscribeProfilePhoto(() => {
      setSrc(getProfilePhoto(id));
    });
  }, [id]);

  const clearError = useCallback(() => setError(null), []);

  const setFromFile = useCallback(
    async (file: File) => {
      if (!id) return;
      setError(null);
      try {
        const dataUrl = await fileToProfilePhotoDataUrl(file);
        setProfilePhoto(id, dataUrl);
        setSrc(dataUrl);
      } catch {
        setError("Couldn't use that image");
      }
    },
    [id],
  );

  const remove = useCallback(() => {
    if (!id) return;
    setError(null);
    removeProfilePhoto(id);
    setSrc(null);
  }, [id]);

  return { src, error, clearError, setFromFile, remove };
}
