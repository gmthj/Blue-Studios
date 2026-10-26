import glassesImage from '../assets/filters/glasses.svg'

// The list of face filters. Each filter is one or more pictures ("parts") stuck onto the face.
// Adding a filter = adding an entry here, no other code changes.
//
// Every part is placed using the face landmarks found by MediaPipe (478 points per face):
//   at:      landmark numbers; the picture's centre goes to the middle of these points
//   width:   picture width, measured in "eye widths" (the distance between the outer eye corners),
//            so the picture gets bigger when the face is closer to the camera
//   offsetX: move right (+) / left (-), in eye widths, following the head's tilt
//   offsetY: move down (+) / up (-), in eye widths, following the head's tilt
//
// Useful landmark numbers:
//   33 / 263 outer eye corners    10 top of forehead    1 nose tip
//   13 / 14  upper / lower lip    152 chin              234 / 454 sides of the face
// Map of all 478 points: https://storage.googleapis.com/mediapipe-assets/documentation/mediapipe_face_landmark_fullsize.png

const FACE_FILTERS = [
  { id: 'none', name: 'No filter', parts: [] },
  {
    id: 'glasses',
    name: 'Sunglasses',
    parts: [{ image: glassesImage, at: [33, 263], width: 1.45, offsetX: 0, offsetY: 0 }],
  },
]

function getFaceFilter(id) {
  return FACE_FILTERS.find((filter) => filter.id === id) || FACE_FILTERS[0]
}

export { FACE_FILTERS, getFaceFilter }
