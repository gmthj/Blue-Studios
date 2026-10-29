import glassesImage from '../assets/filters/glasses.svg'
import puppyEarsImage from '../assets/filters/puppy-ears.svg'
import puppyNoseImage from '../assets/filters/puppy-nose.svg'
import crownImage from '../assets/filters/crown.svg'
import blushImage from '../assets/filters/blush.svg'
import bunnyEarsImage from '../assets/filters/bunny-ears.svg'
import catEarsImage from '../assets/filters/cat-ears.svg'
import catNoseImage from '../assets/filters/cat-nose.svg'
import catWhiskersImage from '../assets/filters/cat-whiskers.svg'
import flowerCrownImage from '../assets/filters/flower-crown.svg'
import heartImage from '../assets/filters/heart.svg'
import mustacheImage from '../assets/filters/mustache.svg'
import devilHornsImage from '../assets/filters/devil-horns.svg'
import haloImage from '../assets/filters/halo.svg'
import partyHatImage from '../assets/filters/party-hat.svg'

// The list of face filters. Each filter is one or more pictures ("parts") stuck onto the face.
// Adding a filter = adding an entry here, no other code changes.
//
//   thumbnail: the picture shown on the filter's button in the filter picker
//
// Every part is placed using the face landmarks found by MediaPipe (478 points per face):
//   at:      landmark numbers; the picture's centre goes to the middle of these points
//   width:   picture width, measured in "eye widths" (the distance between the outer eye corners),
//            so the picture gets bigger when the face is closer to the camera
//   offsetX: move right (+) / left (-), in eye widths, following the head's tilt
//   offsetY: move down (+) / up (-), in eye widths, following the head's tilt
//   flip:    true = mirror the picture left-right (optional), e.g. one picture used for both cheeks
//
// Useful landmark numbers:
//   33 / 263 outer eye corners    10 top of forehead    1 nose tip
//   13 / 14  upper / lower lip    152 chin              234 / 454 sides of the face
//   50 / 280 cheeks               133 / 362 inner eye corners    2 bottom of the nose
// Map of all 478 points: https://storage.googleapis.com/mediapipe-assets/documentation/mediapipe_face_landmark_fullsize.png

const FACE_FILTERS = [
  { id: 'none', name: 'No filter', thumbnail: null, parts: [] },
  {
    id: 'glasses',
    name: 'Sunglasses',
    thumbnail: glassesImage,
    parts: [{ image: glassesImage, at: [33, 263], width: 1.5, offsetX: 0, offsetY: 0 }],
  },
  {
    id: 'puppy',
    name: 'Puppy',
    thumbnail: puppyEarsImage,
    parts: [
      { image: puppyEarsImage, at: [10], width: 2.3, offsetX: 0, offsetY: 0.15 },
      { image: puppyNoseImage, at: [1], width: 0.55, offsetX: 0, offsetY: -0.05 },
    ],
  },
  {
    id: 'crown',
    name: 'Crown',
    thumbnail: crownImage,
    parts: [{ image: crownImage, at: [10], width: 1.7, offsetX: 0, offsetY: -0.6 }],
  },
  {
    id: 'blush',
    name: 'Blush',
    thumbnail: blushImage,
    parts: [
      { image: blushImage, at: [50], width: 0.75, offsetX: 0, offsetY: 0 },
      { image: blushImage, at: [280], width: 0.75, offsetX: 0, offsetY: 0 },
    ],
  },
  {
    id: 'bunny',
    name: 'Bunny',
    thumbnail: bunnyEarsImage,
    parts: [{ image: bunnyEarsImage, at: [10], width: 1.8, offsetX: 0, offsetY: -0.8 }],
  },
  {
    id: 'cat',
    name: 'Cat',
    thumbnail: catEarsImage,
    parts: [
      { image: catEarsImage, at: [10], width: 2.0, offsetX: 0, offsetY: -0.5 },
      { image: catNoseImage, at: [1], width: 0.8, offsetX: 0, offsetY: 0.1 },
      { image: catWhiskersImage, at: [50], width: 0.75, offsetX: -0.15, offsetY: 0.3 },
      { image: catWhiskersImage, at: [280], width: 0.75, offsetX: 0.15, offsetY: 0.3, flip: true },
    ],
  },
  {
    id: 'flower-crown',
    name: 'Flower crown',
    thumbnail: flowerCrownImage,
    parts: [{ image: flowerCrownImage, at: [10], width: 2.1, offsetX: 0, offsetY: -0.1 }],
  },
  {
    id: 'heart-eyes',
    name: 'Heart eyes',
    thumbnail: heartImage,
    parts: [
      { image: heartImage, at: [33, 133], width: 0.55, offsetX: 0, offsetY: 0 },
      { image: heartImage, at: [362, 263], width: 0.55, offsetX: 0, offsetY: 0 },
    ],
  },
  {
    id: 'mustache',
    name: 'Mustache',
    thumbnail: mustacheImage,
    parts: [{ image: mustacheImage, at: [2, 13], width: 0.9, offsetX: 0, offsetY: 0 }],
  },
  {
    id: 'devil',
    name: 'Devil horns',
    thumbnail: devilHornsImage,
    parts: [{ image: devilHornsImage, at: [10], width: 1.6, offsetX: 0, offsetY: -0.5 }],
  },
  {
    id: 'halo',
    name: 'Halo',
    thumbnail: haloImage,
    parts: [{ image: haloImage, at: [10], width: 1.4, offsetX: 0, offsetY: -0.75 }],
  },
  {
    id: 'party-hat',
    name: 'Party hat',
    thumbnail: partyHatImage,
    parts: [{ image: partyHatImage, at: [10], width: 1.0, offsetX: 0, offsetY: -0.85 }],
  },
]

function getFaceFilter(id) {
  return FACE_FILTERS.find((filter) => filter.id === id) || FACE_FILTERS[0]
}

export { FACE_FILTERS, getFaceFilter }
