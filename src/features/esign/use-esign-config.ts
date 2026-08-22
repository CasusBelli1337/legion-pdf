/**
 * The two renderer-visible connection states — the Legion Sign service and the
 * Gmail request sender — plus the setters that change them. Secrets pass
 * straight through to the main process and are never held here: the renderer
 * only ever learns `configured`, exactly as the key-storage rule demands.
 */

import { useCallback, useEffect, useState } from 'react';
import type { EsignMailStatus, EsignServiceStatus } from '@shared/types';

export interface EsignConfig {
  /** Null while the first read is in flight. */
  service: EsignServiceStatus | null;
  mail: EsignMailStatus | null;
  saveService(baseUrl: string, apiKey: string): Promise<void>;
  clearService(): Promise<void>;
  saveMail(address: string, appPassword: string): Promise<void>;
  clearMail(): Promise<void>;
}

export function useEsignConfig(): EsignConfig {
  const [service, setService] = useState<EsignServiceStatus | null>(null);
  const [mail, setMail] = useState<EsignMailStatus | null>(null);

  useEffect(() => {
    let live = true;
    void window.librarius.esign
      .serviceStatus()
      .then((status) => {
        if (live) setService(status);
      })
      .catch(() => undefined);
    void window.librarius.esign
      .mailStatus()
      .then((status) => {
        if (live) setMail(status);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const saveService = useCallback(async (baseUrl: string, apiKey: string) => {
    setService(await window.librarius.esign.setService(baseUrl, apiKey));
  }, []);
  const clearService = useCallback(async () => {
    setService(await window.librarius.esign.clearService());
  }, []);
  const saveMail = useCallback(async (address: string, appPassword: string) => {
    setMail(await window.librarius.esign.setMail(address, appPassword));
  }, []);
  const clearMail = useCallback(async () => {
    setMail(await window.librarius.esign.clearMail());
  }, []);

  return { service, mail, saveService, clearService, saveMail, clearMail };
}
