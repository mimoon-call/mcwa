import type { WAReadyEvent } from '@server/services/whatsapp/whatsapp.type';
import { wa } from '@server/index';

export const getActiveInstanceState = (): WAReadyEvent => {
  const activeList = wa.listInstanceNumbers({ activeFlag: true, onlyConnectedFlag: true });
  const totalCount = wa.listInstanceNumbers({ activeFlag: false, onlyConnectedFlag: false }).length;
  const readyCount = activeList.length;

  return { activeList, readyCount, totalCount };
};
