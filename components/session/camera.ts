/**
 * Camera streams for guided sessions. Every stream opened here is tracked, so
 * we can guarantee there is never more than one at a time and that the camera
 * light goes off whenever a session ends, the page is left, or the tab is hidden.
 *
 * Requests are also made one at a time. React Strict Mode (development) mounts
 * effects twice, which used to open the camera twice at once and stop one of
 * the two straight away. Some webcam drivers handle that badly, and it was the
 * most likely cause of "camera light on, no video" on repeat sessions.
 */

const open = new Set<MediaStream>();
let queue: Promise<unknown> = Promise.resolve();

export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
  audio: false,
};

/** Stop every track of a stream (this is what turns the camera light off). */
export function stopCamera(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  for (const track of stream.getTracks()) track.stop();
  open.delete(stream);
}

/** Stop any camera stream this page still has open. */
export function stopAllCameras(): void {
  for (const stream of [...open]) stopCamera(stream);
}

/**
 * Ask for a brand-new camera stream. Waits for any earlier request to finish,
 * then closes every older stream before opening the new one.
 */
export function openCamera(): Promise<MediaStream> {
  const request = queue.then(async () => {
    stopAllCameras();
    const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
    open.add(stream);
    return stream;
  });
  queue = request.catch(() => undefined);
  return request;
}

// Belt and braces: release the camera if the page is closed or put in the
// browser's back/forward cache.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", stopAllCameras);
}
