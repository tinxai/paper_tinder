/**
 * Fallback suggestions shown during onboarding if the API call for the
 * catalogue fails. The backend is the source of truth; this only keeps
 * onboarding usable offline.
 */
export const FALLBACK_SUGGESTED_INTERESTS = [
  'Human-Computer Interaction',
  'Web Agents',
  'AI Agents',
  'Explainable AI',
  'Interpretable Machine Learning',
  'Vision-Language Models',
  'Human-AI Interaction',
  'Robotics',
  'Computer Vision',
  'Natural Language Processing',
] as const;
