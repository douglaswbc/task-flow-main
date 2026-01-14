
import React from 'react';
import { Link } from 'react-router-dom';

const Cookies: React.FC = () => {
  return (
    <div className="bg-white dark:bg-background-dark min-h-screen py-16 px-6 md:px-12 font-display">
      <div className="max-w-3xl mx-auto prose dark:prose-invert">
        <Link to="/login" className="inline-flex items-center gap-2 text-primary font-bold mb-10 hover:underline">
          <span className="material-symbols-outlined">arrow_back</span> Voltar
        </Link>
        <h1 className="text-4xl font-black mb-8">Política de Cookies</h1>
        
        <div className="space-y-8">
          <section>
            <h2 className="text-2xl font-bold mb-4">O que são Cookies?</h2>
            <p className="text-gray-600 dark:text-gray-400">Cookies são pequenos arquivos de texto enviados pelo site ao seu computador para reconhecer sua sessão e preferências.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Como usamos?</h2>
            <ul className="list-disc pl-5 space-y-2 text-gray-600 dark:text-gray-400">
              <li><strong>Essenciais:</strong> Para manter você logado no sistema.</li>
              <li><strong>Preferências:</strong> Para lembrar seu modo escuro/claro.</li>
              <li><strong>Analytics:</strong> Para entender como melhorar a interface.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Gerenciamento</h2>
            <p className="text-gray-600 dark:text-gray-400">Você pode desativar os cookies nas configurações do seu navegador, mas isso poderá afetar a funcionalidade da plataforma.</p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Cookies;
