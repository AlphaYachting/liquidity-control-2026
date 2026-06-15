import React from 'react';
import { useParams } from 'react-router-dom';
import ProjectDetailContent from '@/components/projects/ProjectDetailContent';

export default function ProjectDetail() {
  const { projectId } = useParams();
  return <ProjectDetailContent projectId={projectId} embedded={false} />;
}