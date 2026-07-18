

import { useStore } from '../stores';
import { mikoFetch } from '../hooks/use-miko-fetch';
import { errorBus } from '../../../../shared/error-bus.ts';
import { AppError } from '../../../../shared/errors.ts';



export function setStatus(key: string, connected: boolean, vars: Record<string, string | number> = {}): void {
  useStore.setState({ connected, statusKey: key, statusVars: vars });
}



export function showError(message: string): void {
  errorBus.report(new AppError('UNKNOWN', { message }));
}



export async function loadModels(): Promise<void> {
  try {
    const res = await mikoFetch('/api/models');
    const data = await res.json();
    const { pendingNewSession } = useStore.getState();
    const activeModel = data.activeModel;
    let models = data.models || [];

    
    
    if (!pendingNewSession && activeModel) {
      models = models.map((m: any) => ({
        ...m,
        isCurrent: m.id === activeModel.id && m.provider === activeModel.provider,
      }));
    }

    const currentModelObj = models.find((m: any) => m.isCurrent);
    useStore.setState({
      models,
      currentModel: currentModelObj ? { id: currentModelObj.id, provider: currentModelObj.provider } : null,
    });
  } catch { /* silent */ }
}

