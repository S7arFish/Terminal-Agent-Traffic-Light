import { describe, expect, it } from 'vitest';
import { estimatePanelSize } from '../../desktop/panelSizing';

describe('estimatePanelSize', () => {
  it('keeps a status-only panel compact', () => expect(estimatePanelSize()).toEqual({ width: 360, height: 360 }));
  it('grows for long questions and multiple long options', () => {
    const short = estimatePanelSize('Run tests?', ['Yes', 'No']);
    const long = estimatePanelSize('请检查数据库迁移是否会覆盖现有用户数据，并确认备份已经完成。'.repeat(8), ['继续执行数据库迁移并记住此选择', '停止并返回修改配置', '只创建备份，不执行迁移']);
    expect(long.width).toBeGreaterThan(short.width);
    expect(long.height).toBeGreaterThan(short.height);
    expect(long.height).toBeGreaterThan(600);
  });
});
