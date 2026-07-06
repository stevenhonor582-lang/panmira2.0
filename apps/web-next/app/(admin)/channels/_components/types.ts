// 当前后端用 routing_bindings 表(plan B Channel 实体待实现)
export interface ChannelBinding {
  id: string;
  groupId: string | null;
  pattern: string | null;
  targetBots: string[];
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelCreate {
  groupId?: string;
  pattern?: string;
  targetBots?: string[];
  priority?: number;
  enabled?: boolean;
}
