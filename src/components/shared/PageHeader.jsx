import React from 'react';
import Seitenkopf from '@/components/shared/Seitenkopf';

// Hülle für die bestehenden Seiten — sie erben damit sofort den gemeinsamen Kopf.
export default function PageHeader({ title, subtitle, actions }) {
  return <Seitenkopf titel={title} kontext={subtitle} aktionen={actions} />;
}