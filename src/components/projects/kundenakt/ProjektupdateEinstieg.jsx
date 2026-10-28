import React from 'react';
import { PenLine, FileAudio } from 'lucide-react';

const Eintrag = ({ icon: Icon, titel, text, onClick }) => (
  <button onClick={onClick}
    className="block w-full text-left px-3 py-2.5 rounded-xl border bg-card hover:bg-muted transition-colors">
    <span className="flex items-center gap-2 text-sm font-medium">
      <Icon className="w-4 h-4 text-primary" /> {titel}
    </span>
    <span className="block mt-1 text-xs text-muted-foreground">{text}</span>
  </button>
);

// Einstiege im leeren Panel — der Nutzer wählt den Weg selbst.
export default function ProjektupdateEinstieg({ onStart, onMeetingImport }) {
  return (
    <div className="space-y-3">
      <Eintrag icon={PenLine} titel="Projektupdate festhalten" onClick={onStart}
        text="Erzähl, was passiert ist — ich formuliere daraus einen Eintrag für den Projektakt." />
      {onMeetingImport && (
        <Eintrag icon={FileAudio} titel="Meeting importieren" onClick={onMeetingImport}
          text="Transkript hochladen oder einfügen — ich schlage daraus Aufgaben vor." />
      )}
      <div className="border-t" />
      <p className="text-xs text-muted-foreground">oder eine Frage stellen:</p>
    </div>
  );
}
