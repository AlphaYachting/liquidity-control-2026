import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { ShieldAlert } from 'lucide-react';

export default function AdminRoute({ children }) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/" replace />;

  if (user.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="p-4 rounded-2xl bg-destructive/10 mb-4">
          <ShieldAlert className="w-10 h-10 text-destructive" />
        </div>
        <h2 className="text-xl font-bold">Kein Zugriff</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md">
          Dieser Bereich ist nur für Administratoren zugänglich. Bitte wende dich an einen Administrator, falls du Zugriff benötigst.
        </p>
      </div>
    );
  }

  return children;
}