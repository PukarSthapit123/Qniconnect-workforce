import { useEffect, useState } from 'react';

/* A value that follows another once it has stopped changing for ms milliseconds: a
   filter typed into a box asks the server once the typing pauses, not on
   every character (ui-review row 92). The box itself keeps the live value. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}
