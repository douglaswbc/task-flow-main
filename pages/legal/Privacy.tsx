
import React from 'react';
import { Link } from 'react-router-dom';

const Privacy: React.FC = () => {
  return (
    <div className="bg-white dark:bg-background-dark min-h-screen py-16 px-6 md:px-12 font-display">
      <div className="max-w-3xl mx-auto prose dark:prose-invert">
        <Link to="/login" className="inline-flex items-center gap-2 text-primary font-bold mb-10 hover:underline">
          <span className="material-symbols-outlined">arrow_back</span> Voltar
        </Link>
        <h1 className="text-4xl font-black mb-8">Política de Privacidade</h1>
        <p className="text-gray-500 mb-6">Última atualização: 20 de Maio de 2024</p>
        
        <h2 className="text-2xl font-bold mt-10 mb-4">1. Coleta de Informações</h2>
        <p className="leading-relaxed mb-6">Coletamos informações que você nos fornece diretamente ao criar uma conta, como seu nome, endereço de e-mail e cargo. Também coletamos dados sobre o uso do TaskFlow para melhorar nossos serviços.</p>

        <h2 className="text-2xl font-bold mt-10 mb-4">2. Uso dos Dados</h2>
        <p className="leading-relaxed mb-6">Seus dados são utilizados exclusivamente para o fornecimento do serviço de automação de tarefas, suporte ao cliente e comunicações sobre atualizações críticas do sistema.</p>

        <h2 className="text-2xl font-bold mt-10 mb-4">3. Segurança</h2>
        <p className="leading-relaxed mb-6">Empregamos protocolos de segurança de nível industrial, incluindo criptografia SSL e armazenamento seguro em nuvem, para proteger suas informações contra acesso não autorizado.</p>

        <div className="mt-20 pt-8 border-t border-gray-100 dark:border-gray-800">
          <p className="text-sm text-gray-400">© 2024 TaskFlow. Todos os direitos reservados.</p>
        </div>
      </div>
    </div>
  );
};

export default Privacy;
