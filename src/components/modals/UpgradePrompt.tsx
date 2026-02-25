/**
 * UpgradePrompt — a reusable modal/banner shown when a user hits a tier limit.
 *
 * Usage:
 *   <UpgradePrompt
 *     limitType="desks"
 *     plan="free"
 *     current={3}
 *     max={3}
 *     onClose={() => setShowUpgrade(false)}
 *     onUpgrade={() => navigate('/select-plan')}
 *   />
 */

import React from 'react';
import { X } from 'lucide-react';
import { upgradeMessage, TIER_PRICING, nextTier } from '../../utils/tierConfig';
import type { PlanTier } from '../../utils/tierConfig';
import './UpgradePrompt.css';

interface UpgradePromptProps {
  limitType: string;
  plan: PlanTier;
  current: number;
  max: number;
  onClose: () => void;
  onUpgrade: () => void;
}

const UpgradePrompt: React.FC<UpgradePromptProps> = ({
  limitType,
  plan,
  current,
  max,
  onClose,
  onUpgrade,
}) => {
  const next = nextTier(plan);
  if (!next) return null; // already on top tier

  const message = upgradeMessage(limitType, plan);
  const nextLabel = TIER_PRICING[next].label;
  const nextPrice = TIER_PRICING[next].price;

  return (
    <div className="upgrade-prompt-overlay" onClick={onClose}>
      <div className="upgrade-prompt" onClick={(e) => e.stopPropagation()}>
        <button className="upgrade-prompt-close" onClick={onClose}>
          <X size={16} />
        </button>

        <div className="upgrade-prompt-badge">LIMIT REACHED</div>

        <div className="upgrade-prompt-counter">
          {current}/{max}
        </div>

        <p className="upgrade-prompt-message">{message}</p>

        <div className="upgrade-prompt-actions">
          <button className="upgrade-prompt-btn primary" onClick={onUpgrade}>
            Upgrade to {nextLabel} - ${nextPrice}/mo
          </button>
          <button className="upgrade-prompt-btn secondary" onClick={onClose}>
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpgradePrompt;
