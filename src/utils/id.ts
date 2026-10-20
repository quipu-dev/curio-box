/**
 * 生成紧凑、时间单调递增的相册唯一标识符
 * 格式：alb_<9位base36时间戳><5位随机熵>
 * 特性：字符串字典序排列严格等价于生成时间先后顺序，符合不可变物理键原则
 */
export function generateAlbumId(): string {
  const timestamp = Date.now().toString(36).padStart(9, '0');
  const entropy = Math.random().toString(36).slice(2, 7).padEnd(5, '0');
  return `alb_${timestamp}${entropy}`;
}

/**
 * 生成紧凑、时间单调递增的工作区唯一标识符
 * 格式：ws_<9位base36时间戳><5位随机熵>
 */
export function generateWorkspaceId(): string {
  const timestamp = Date.now().toString(36).padStart(9, '0');
  const entropy = Math.random().toString(36).slice(2, 7).padEnd(5, '0');
  return `ws_${timestamp}${entropy}`;
}
