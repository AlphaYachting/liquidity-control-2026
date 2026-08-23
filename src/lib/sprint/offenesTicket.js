import { useEffect, useState } from 'react';

// Welche Aufgabe ist gerade im Ticketpanel geöffnet? Der Timer schreibt deren ticket_id mit.
let aktuell = null;
const hoerer = new Set();

export const setzeOffenesTicket = (id) => {
  aktuell = id || null;
  hoerer.forEach((f) => f(aktuell));
};

export function useOffenesTicket() {
  const [id, setId] = useState(aktuell);
  useEffect(() => {
    hoerer.add(setId);
    return () => hoerer.delete(setId);
  }, []);
  return id;
}