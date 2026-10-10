import { useEffect, useState } from 'react';
import { locationState, subscribeLocation } from '../agents/location.js';

/** The owner's live location state ({ location, accuracy, updatedAt, error, watching }). */
export default function useLiveLocation() {
  const [state, setState] = useState(locationState);
  useEffect(() => subscribeLocation(setState), []);
  return state;
}
