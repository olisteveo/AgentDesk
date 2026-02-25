import React from 'react';

interface CostPanelProps {
  activeTasks: number;
  completedTasks: number;
  totalAgents: number;
  todayApiCost: number;
  monthCost: number;
  onOpenCostDashboard: () => void;
}

export const CostPanel: React.FC<CostPanelProps> = ({
  activeTasks,
  completedTasks,
  totalAgents,
  todayApiCost,
  monthCost,
  onOpenCostDashboard
}) => {
  return (
    <div className="stats-panel" onClick={onOpenCostDashboard} style={{ cursor: 'pointer' }}>
      <h3>Active: {activeTasks} | Done: {completedTasks}</h3>
      <h3>Agents: {totalAgents}</h3>
      <div className="cost-summary">
        <h3>Today's Cost</h3>
        <div className="cost-amount">${todayApiCost.toFixed(4)}</div>
        <div className="cost-breakdown">
          <span>API costs today</span>
          {monthCost > 0 && <span>Month: ${monthCost.toFixed(2)}</span>}
        </div>
      </div>
      <div style={{ marginTop: '8px', fontSize: '10px', color: '#888', textAlign: 'center' }}>
        Click for cost dashboard
      </div>
    </div>
  );
};
