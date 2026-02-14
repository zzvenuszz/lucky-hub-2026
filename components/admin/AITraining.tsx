
import React, { memo } from 'react';
import { AIKnowledge, AIRule } from '../../types.ts';
import KnowledgeManager from './ai/KnowledgeManager.tsx';
import RuleManager from './ai/RuleManager.tsx';
import AITestLab from './ai/AITestLab.tsx';

interface AITrainingProps {
  knowledge: AIKnowledge[];
  rules: AIRule[];
  onRefresh: () => void;
}

const AITraining: React.FC<AITrainingProps> = ({ knowledge, rules, onRefresh }) => {
  return (
    <div className="space-y-10 animate-in fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <KnowledgeManager knowledge={knowledge} onRefresh={onRefresh} />
        <RuleManager rules={rules} onRefresh={onRefresh} />
      </div>
      
      <AITestLab knowledge={knowledge} rules={rules} />
    </div>
  );
};

export default memo(AITraining);
