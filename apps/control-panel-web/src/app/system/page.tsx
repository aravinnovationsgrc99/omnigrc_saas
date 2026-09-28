import React from 'react';
import { PlaceholderPage } from '../../components/ui/placeholder-page';

export default function SystemPage() {
  return (
    <PlaceholderPage
      title="System Settings & Key Registry"
      description="Control plane signing key rotation status, environment configs, and platform health."
      phaseLabel="CP-6.6"
    />
  );
}
