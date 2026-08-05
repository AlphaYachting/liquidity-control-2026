import React from 'react';
import { toHtml } from '@/components/crm/quotes/emailBodyFormat';

// Zeigt den Mailtext so, wie er formatiert im E-Mail-Programm ankommt.
export default function EmailBodyPreview({ body }) {
  return (
    <div
      className="rounded-md border bg-white p-4 min-h-[320px] overflow-y-auto"
      dangerouslySetInnerHTML={{ __html: toHtml(body) }}
    />
  );
}