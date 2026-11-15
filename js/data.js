// Chakra, note and element data.
// Each point carries three layers: a familiar name (Root ... Crown), its quality,
// and its pelog note (Ji ... Pi). Cents describe Swarnajiwa's own embat: like every
// gamelan, it has its own tuning. Ji sits at 136 Hz (see audio.js).

export const CHAKRAS = [
  {
    id: 'muladhara', name: 'Root', en: 'Root', sanskrit: 'Muladhara', note: 'Ji', cents: 0,
    color: [255, 64, 72], hex: '#ff4048',
    quality: 'Grounding',
    guide: 'Feel the weight of your body resting on the earth. You are held. You are safe.',
  },
  {
    id: 'svadhisthana', name: 'Sacral', en: 'Sacral', sanskrit: 'Svadhisthana', note: 'Ro', cents: 120,
    color: [255, 140, 50], hex: '#ff8c32',
    quality: 'Flow',
    guide: 'Let your breath move like water below the navel. Soft, fluid, unforced.',
  },
  {
    id: 'manipura', name: 'Solar Plexus', en: 'Solar Plexus', sanskrit: 'Manipura', note: 'Lu', cents: 258,
    color: [255, 212, 70], hex: '#ffd446',
    quality: 'Warmth',
    guide: 'Notice a small warm sun in your belly. Steady focus, quiet strength.',
  },
  {
    id: 'anahata', name: 'Heart', en: 'Heart', sanskrit: 'Anahata', note: 'Pat', cents: 539,
    color: [72, 224, 140], hex: '#48e08c',
    quality: 'Compassion',
    guide: 'Breathe into the centre of your chest. Let the heart widen with every exhale.',
  },
  {
    id: 'vishuddha', name: 'Throat', en: 'Throat', sanskrit: 'Vishuddha', note: 'Ma', cents: 675,
    color: [70, 176, 255], hex: '#46b0ff',
    quality: 'Expression',
    guide: 'Soften the throat and jaw. Let the breath pass through like a clear breeze.',
  },
  {
    id: 'ajna', name: 'Third Eye', en: 'Third Eye', sanskrit: 'Ajna', note: 'Nem', cents: 785,
    color: [104, 110, 255], hex: '#686eff',
    quality: 'Clarity',
    guide: 'Rest your attention between the brows. Watch thoughts pass like distant stars.',
  },
  {
    id: 'sahasrara', name: 'Crown', en: 'Crown', sanskrit: 'Sahasrara', note: 'Pi', cents: 943,
    color: [196, 120, 255], hex: '#c478ff',
    quality: 'Unity',
    guide: 'Feel the space above your head open into the sky. Nothing to hold. Only stillness.',
  },
];

export const ELEMENTS = [
  { id: 'earth', name: 'Earth', instrument: 'Gong', sanskrit: 'Prithvi' },
  { id: 'water', name: 'Water', instrument: 'Gender', sanskrit: 'Apas' },
  { id: 'fire', name: 'Fire', instrument: 'Bonang', sanskrit: 'Tejas' },
  { id: 'wind', name: 'Wind', instrument: 'Suling', sanskrit: 'Vayu' },
  { id: 'ether', name: 'Akasha', instrument: 'Genta', sanskrit: 'Akasha' },
];

// Each step: [cue, seconds, target breath level 0..1, or null to hold]
export const BREATH_PATTERNS = [
  { id: 'calm', name: 'Calm', label: '5 · 5', steps: [['Inhale', 5, 1], ['Exhale', 5, 0]] },
  { id: 'sigh', name: 'Sigh', label: '2 + 1 · 6', steps: [['Inhale', 2, 0.75], ['Sip in', 1, 1], ['Long exhale', 6, 0]] },
  { id: 'box', name: 'Box', label: '4 · 4 · 4 · 4', steps: [['Inhale', 4, 1], ['Hold', 4, null], ['Exhale', 4, 0], ['Hold', 4, null]] },
  { id: 'relax', name: 'Relax', label: '4 · 7 · 8', steps: [['Inhale', 4, 1], ['Hold', 7, null], ['Exhale', 8, 0]] },
];

export const MOODS = ['Tense', 'Uneasy', 'Okay', 'Calm', 'Serene'];
