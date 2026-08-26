import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useDataSourceStatus } from '@/lib/data-source';
import { getApiBaseUrl } from '@/lib/api-service';

/**
 * Banner global, afisat cat timp cel putin un ecran serveste date din
 * demo-data.js pentru ca bridge-ul nu raspunde.
 *
 * Deliberat imposibil de ignorat si imposibil de inchis: un banner pe care
 * poti da click sa dispara ar readuce exact problema pe care o rezolva.
 */
export default function DemoDataBanner() {
  const { isDemo, demoKeys } = useDataSourceStatus();

  if (!isDemo) return null;

  return (
    <div
      role="alert"
      className="sticky top-0 z-50 border-b border-amber-500/30 bg-amber-500/15 backdrop-blur px-4 py-2"
    >
      <div className="max-w-[1600px] mx-auto flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed">
          <span className="font-semibold text-amber-600">
            Atenție: cifrele afișate sunt date demo, inventate.
          </span>{' '}
          <span className="text-amber-600/80">
            Bridge-ul de date nu răspunde la <code className="font-mono">{getApiBaseUrl()}</code>,
            deci {demoKeys.length}{' '}
            {demoKeys.length === 1 ? 'secțiune folosește' : 'secțiuni folosesc'} valori
            de test. Nu lua decizii pe baza lor.
          </span>
        </div>
      </div>
    </div>
  );
}
