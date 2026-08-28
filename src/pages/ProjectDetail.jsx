import React from 'react';
import { useParams } from 'react-router-dom';
import ProjectDetailContent from '@/components/projects/ProjectDetailContent';
import { useMeldeZeitKontext } from '@/lib/sprint/ZeitKontext';

export default function ProjectDetail() {
  const { projectId } = useParams();
  useMeldeZeitKontext({ project_id: projectId, quelle: 'projektseite' });
  return <ProjectDetailContent projectId={projectId} embedded={false} />;
}