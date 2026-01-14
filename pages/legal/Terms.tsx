
import React from 'react';
import { Link } from 'react-router-dom';

const Terms: React.FC = () => {
  return (
    <div className="bg-white dark:bg-background-dark min-h-screen py-16 px-6 md:px-12 font-display">
      <div className="max-w-3xl mx-auto prose dark:prose-invert">
        <Link to="/login" className="inline-flex items-center gap-2 text-primary font-bold mb-10 hover:underline">
          <span className="material-symbols-outlined">arrow_back</span> Voltar
        </Link>
        <h1 className="text-4xl font-black mb-8">Termos de Serviço</h1>
        <p className="text-gray-500 mb-6">Vigente a partir de: Junho de 2024</p>

        <h2 className="text-2xl font-bold mt-10 mb-4">1. Aceitação dos Termos</h2>
        <p className="leading-relaxed mb-6">Ao utilizar o TaskFlow, você concorda em cumprir estes termos e todas as leis e regulamentos aplicáveis.</p>

        <h2 className="text-2xl font-bold mt-10 mb-4">2. Licença de Uso</h2>
        <p className="leading-relaxed mb-6">Concedemos uma licença limitada e não exclusiva para acessar a plataforma de acordo com o plano contratado.</p>

        <h2 className="text-2xl font-bold mt-10 mb-4">3. Responsabilidades</h2>
        <p className="leading-relaxed mb-6">O usuário é responsável por manter a confidencialidade de sua senha e por todas as atividades que ocorram sob sua conta.</p>

        <div className="mt-20 pt-8 border-t border-gray-100 dark:border-gray-800 text-center">
          <p className="text-sm text-gray-400 italic">Dúvidas? Entre em contato via suporte@taskflow.com</p>
        </div>
      </div>
    </div>
  );
};

export default Terms;
