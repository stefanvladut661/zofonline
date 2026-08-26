import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// NOTA: aici exista `export const isIframe = window.self !== window.top`, evaluat
// la nivel de modul. Servea preview-ul in iframe al builder-ului Base44, nu era
// folosit nicaieri in cod, si arunca ReferenceError in orice context fara `window`.
