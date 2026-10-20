# FIDC IJJ

Sistema web para gestão de operações de recebíveis, fluxo de caixa e investimentos, com integrações bancárias e portal do cliente.

## Funcionalidades

| Módulo | Recursos |
| --- | --- |
| Operações e borderôs | Cadastro, análise e acompanhamento de operações de recebíveis. |
| Duplicatas | Liquidação, recompra, renegociação e emissão de boletos. |
| Fluxo de caixa | Entradas, saídas, transferências, saldos por conta e conciliação com extratos. |
| Investimentos | Contas, aplicações, aportes, resgates, transferências entre aplicações e rendimentos. |
| Cadastros | Clientes, contas bancárias e tipos de operação. |
| Relatórios | Consultas financeiras e geração de documentos, incluindo PDFs. |
| Portal do cliente | Consulta de operações, duplicatas, limite de crédito e simulação de operações. |
| Agenda e notificações | Acompanhamento de compromissos e avisos do sistema. |

O código inclui integrações com Itaú, Inter, Bradesco e Safra. A disponibilidade de cada recurso depende das credenciais, certificados e permissões habilitadas no banco.

## Tecnologias

- **Next.js 16**, com App Router, rotas de API e Turbopack.
- **React 19** e **Tailwind CSS 4** para a interface.
- **Supabase / PostgreSQL** para dados, funções SQL e gatilhos.
- **JWT e bcryptjs** para autenticação e validação de senhas.
- **Nodemailer** para envio de e-mails.
- **jsPDF, PDFKit, pdf-lib e SheetJS** para documentos e planilhas.
- **Recharts, ApexCharts e Framer Motion** para gráficos e animações.

As dependências estão no [package.json](package.json), e as versões resolvidas estão no [package-lock.json](package-lock.json).

## Executar localmente

### Pré-requisitos

- Node.js **20.9 ou superior**, conforme o requisito da versão instalada do Next.js.
- npm.
- Um projeto Supabase com a estrutura de dados utilizada pelo sistema.
- Um usuário cadastrado na tabela `users`, com senha armazenada como hash bcrypt, para acessar a aplicação.

### Instalação e configuração

Na raiz do repositório:

```bash
npm ci
```

Crie um arquivo `.env.local` com os dados do seu ambiente:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_KEY=sua-chave-de-servico
JWT_SECRET=seu-segredo-jwt

NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_LOGIN_URL=http://localhost:3000/login

# ID do cliente que representa a empresa, quando utilizado pela tela
NEXT_PUBLIC_MASTER_CLIENT_ID=id-do-cliente-master

# Necessárias para os recursos de envio de e-mail
EMAIL_USERNAME=seu-email
EMAIL_PASSWORD=sua-senha-de-aplicativo
```

Os valores acima são exemplos. A chave de serviço do Supabase e o segredo JWT devem permanecer no servidor; nunca use o prefixo `NEXT_PUBLIC_` para esses segredos. O `.env.local` é ignorado pelo Git.

O serviço de e-mail utiliza `smtp.gmail.com`, porta 587. Os fluxos que enviam e-mail precisam de uma conta com autenticação compatível.

Inicie o servidor:

```bash
npm run dev
```

Acesse [http://localhost:3000/login](http://localhost:3000/login). Reinicie o servidor ao alterar as variáveis de ambiente.

### Cliente master

Algumas telas usam `NEXT_PUBLIC_MASTER_CLIENT_ID`. A API que lista as contas da empresa e a rotina de aporte com origem cadastrada consideram o **primeiro cliente cadastrado, ordenado por ID**, como cliente master. Confira se os dois critérios apontam para a mesma empresa.

## Banco de dados e migrações

Os arquivos SQL ficam em [supabase/migrations](supabase/migrations). Eles incluem tabelas, funções, gatilhos e alterações incrementais.

**O diretório não contém a criação completa da base do sistema.** Algumas migrações dependem de tabelas existentes, como `clientes`, `users`, `contas_bancarias`, `operacoes`, `duplicatas` e `movimentacoes_caixa`. Uma instalação em banco vazio exige primeiro o esquema base compatível.

Para atualizar um ambiente existente:

1. Confira quais migrações já foram aplicadas.
2. Revise as pendentes e suas dependências na ordem dos nomes dos arquivos.
3. Execute as aplicáveis no SQL Editor do Supabase ou pelo processo de migração adotado no ambiente.
4. Valide os saldos e os fluxos afetados após a atualização.

Nem todos os arquivos são idempotentes; evite reexecutá-los indiscriminadamente.

### Migrações de investimentos

| Arquivo | Finalidade |
| --- | --- |
| [20260324143000](supabase/migrations/20260324143000_create_investimentos_module.sql) | Cria contas, aplicações e movimentações de investimentos. |
| [20261014000001](supabase/migrations/20261014000001_integrar_fluxo_caixa_investimentos.sql) | Vincula lançamentos do fluxo de caixa a movimentações de investimentos. |
| [20261020000001](supabase/migrations/20261020000001_investimentos_dias_uteis.sql) | Define dias úteis como base das aplicações existentes e novas. |
| [20261020000004](supabase/migrations/20261020000004_aporte_conta_origem.sql) | Adiciona origem ao aporte, débito vinculado e correção da função de conciliação OFX. |

Os arquivos `20261020000002_unificar_conta_itau_transferencias.sql` e `20261020000003_corrigir_residuo_itau.sql` são **correções específicas de dados de um ambiente**, com conta e lançamento identificados no SQL. Revise sua aplicabilidade antes de incluí-los em outra base.

## Investimentos

### Rendimentos

O cálculo considera dias úteis de **segunda a sexta-feira**. A taxa mensal é dividida pela quantidade desses dias no mês e aplicada ao saldo de abertura do dia, com arredondamento monetário diário. Sábados e domingos não geram rendimento; feriados ainda não são descontados.

As movimentações do dia entram depois do rendimento diário. Por isso, um novo aporte passa a participar do cálculo a partir do próximo dia útil.

### Aporte com conta de origem

Na tela **Investimentos**, abra um novo lançamento, selecione **Aporte** e informe a conta e a aplicação de destino, a data, o valor e a origem:

- **Conta cadastrada da empresa:** registra o aporte e um débito de mesmo valor na conta de origem, na mesma transação do banco de dados. Se uma gravação falhar, ambas são revertidas.
- **Outra conta sem vínculo:** salva a identificação informada e o aporte, sem alterar os saldos das contas cadastradas.

A origem aparece na lista de movimentações. Para alterar um aporte com débito vinculado, exclua e recrie o lançamento; a edição isolada é bloqueada para manter os valores consistentes.

A exclusão do aporte também remove o débito vinculado. Se o débito já tiver conciliação OFX, a exclusão é bloqueada pelo vínculo de conciliação.

O registro atualiza os saldos internos; ele **não executa uma transferência bancária**.

### Conciliação OFX

A conciliação automática compara conta, data e valor do extrato com os lançamentos do caixa. Uma correspondência única permite o vínculo; múltiplas correspondências exigem revisão. Uma transação já conciliada não é vinculada novamente.

O débito criado por um aporte fica disponível para essa comparação quando o extrato OFX é importado. A criação do aporte, sozinha, não comprova a transação no banco.

### Relatórios por e-mail

No botão **Relatórios por e-mail**, adicione cada destinatário e selecione suas aplicações. Cada endereço recebe um PDF e um resumo financeiro contendo somente suas aplicações, tanto no envio manual quanto no automático. Assunto, mensagem e frequência são compartilhados pela configuração, salva por usuário da equipe interna. Para baixar uma prévia, escolha o destinatário correspondente.

A opção **Todas as aplicações** seleciona ou desmarca todas as aplicações daquele destinatário. Uma seleção vazia não concede acesso a todas: é necessário selecionar ao menos uma aplicação por e-mail para salvar ou enviar. Configurações antigas devem ser revisadas e salvas novamente; agendamentos antigos sem uma seleção explícita não enviam relatórios até essa revisão. Os vínculos ficam no JSON da configuração, sem necessidade de nova migração SQL.

O anexo inclui saldo inicial e final, aportes, retiradas, rendimentos, transferências, ajustes, posição por aplicação e extrato completo com observações e origem dos aportes. O histórico anterior ao período é considerado no saldo inicial. Cada destinatário recebe uma mensagem individual.

Para ativar o envio automático:

1. Aplique a [migração de relatórios por e-mail](supabase/migrations/20261020000005_investimentos_relatorios_email.sql).
2. Configure `EMAIL_USERNAME`, `EMAIL_PASSWORD` e um `CRON_SECRET` aleatório e privado no servidor.
3. Publique o projeto com o [vercel.json](vercel.json), que agenda a rota `/api/cron/investimentos-relatorios` diariamente às 11h UTC (8h em Brasília). Em outra hospedagem, configure um agendador equivalente que chame a rota com `Authorization: Bearer <CRON_SECRET>`.
4. No modal, ative o envio automático, escolha a frequência e salve a configuração.

| Frequência | Período do relatório automático |
| --- | --- |
| Diária | Dia anterior ao envio. |
| Semanal | Sete dias anteriores, no dia da semana escolhido. |
| Mensal | Mês anterior completo, no dia escolhido entre 1 e 28. |

As datas do formulário valem para o envio manual. O automático calcula o período em `America/Sao_Paulo` e usa os destinatários e aplicações salvos. Usuários removidos ou sem perfil interno não geram novos envios.

O último resultado automático aparece no modal. Uma reserva única por usuário e dia evita repetir o envio quando o agendador é chamado novamente. Em caso de falha, envio parcial ou interrupção, confira o resultado e reenvie manualmente apenas para quem não recebeu; o agendador não repete aquela tentativa no mesmo dia.

## Integrações

### Alertas automáticos de duplicatas

Em **Consultas → Alertas por e-mail**, configure os destinatários e ative os grupos desejados: vencimento no dia e duplicatas vencidas. O resumo é enviado diariamente às 8h de Brasília, inclusive nos fins de semana, enquanto houver títulos pendentes. A seleção considera toda a carteira de operações aprovadas, independentemente dos filtros da tela. Não há envio automático aos sacados.

Aplique a [migração dos alertas](supabase/migrations/20261020000006_alertas_duplicatas_email.sql), mantenha `CRON_SECRET`, `EMAIL_USERNAME` e `EMAIL_PASSWORD` configurados e publique o `vercel.json` atualizado. A nova rota agendada é `/api/cron/duplicatas-alertas`; em outra hospedagem, chame-a diariamente com `Authorization: Bearer <CRON_SECRET>`.

O e-mail contém os totais e até 50 títulos por grupo; o CSV anexo contém a relação completa, com cedente, sacado, NF/CT-e, vencimento, dias de atraso e valor. Os valores incluem os juros da operação pós-fixada quando aplicáveis, sem atualização de multa ou mora. Nenhum e-mail é enviado se os grupos selecionados estiverem vazios.

Cada usuário interno tem sua configuração e pode acompanhar o último resultado no modal. Uma chave única por usuário e data impede repetir a tentativa automática no mesmo dia, inclusive após falha ou envio parcial. Os testes são executados com `npm run test:duplicatas` (Node.js 22.7+), sem SMTP real.

Configure apenas as integrações necessárias ao ambiente. A tabela lista as principais variáveis lidas pelos serviços; parâmetros adicionais de contas, boletos e extratos aparecem nas respectivas rotas de API.

| Integração | Principais variáveis | Implementação |
| --- | --- | --- |
| Itaú | `ITAU_CLIENT_ID`, `ITAU_CLIENT_SECRET`, `ITAU_CERTIFICATE`, `ITAU_PRIVATE_KEY` | [itauService.js](src/app/lib/itauService.js) |
| Inter | `INTER_CLIENT_ID`, `INTER_CLIENT_SECRET`, `INTER_CERTIFICATE`, `INTER_PRIVATE_KEY`, `INTER_ENV` | [interService.js](src/app/lib/interService.js) |
| Bradesco | `BRADESCO_CLIENT_ID`, `BRADESCO_CLIENT_SECRET`, `BRADESCO_PUBLIC_CERT`, `BRADESCO_PRIVATE_KEY`, `BRADESCO_BASE_URL` | [bradescoService.js](src/app/lib/bradescoService.js) |
| Safra | `SAFRA_CLIENT_ID`, `SAFRA_USERNAME`, `SAFRA_PASSWORD` | [safraService.js](src/app/lib/safraService.js) |
| E-mail | `EMAIL_USERNAME`, `EMAIL_PASSWORD`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_LOGIN_URL` | [emailService.js](src/app/lib/emailService.js) |

Para a apresentação da conta Itaú, o código também utiliza `NEXT_PUBLIC_ITAU_CONTA_DB` e `NEXT_PUBLIC_ITAU_CONTA_DISPLAY`. São configurações de identificação/exibição, não credenciais bancárias.

## Estrutura do projeto

```text
src/app/
  api/                  Rotas de API e integrações no servidor
  components/           Componentes compartilhados
  lib/                  Serviços e regras de negócio
  utils/                Formatação e cliente Supabase
  login/                Autenticação
  operacao-bordero/      Cadastro de operações
  analise/              Análise de operações
  consultas/            Consultas operacionais
  fluxo-caixa/          Movimentações, saldos e conciliação
  investimentos/        Aplicações e movimentações de investimentos
  cadastros/            Cadastros do sistema
  portal/               Área do cliente
  agenda/               Agenda
  notificacoes/         Notificações
public/                 Arquivos estáticos
supabase/migrations/    Alterações SQL incrementais
```

## Comandos e validação

| Comando | Uso |
| --- | --- |
| `npm ci` | Instala as dependências conforme o lockfile. |
| `npm run dev` | Inicia o desenvolvimento com Turbopack. |
| `npm run build` | Gera o build de produção com Turbopack. |
| `npm start` | Executa o build de produção já gerado. |
| `npm run test:investimentos` | Testa os totais do relatório, paginação, agendamento, PDF, acesso e envio simulado. Use Node.js 22.7 ou superior para esse comando. |

O script `npm run lint` ainda aponta para `next lint`, incompatível com a versão 16 utilizada pelo projeto. A execução direta com `npx eslint .` também depende de corrigir a configuração atual em [eslint.config.mjs](eslint.config.mjs), que apresentou erro de referência circular. O lint não deve ser considerado uma verificação disponível até esse ajuste.

Os testes de relatórios usam o executor nativo do Node.js e simulam o envio de e-mail, sem acessar o SMTP real. Alterações financeiras também devem ser verificadas em uma base de validação, cobrindo saldos, vínculos de conciliação e reversão de transações em caso de falha.

## Produção

Configure as variáveis de ambiente na hospedagem, aplique as migrações pertinentes e gere o build:

```bash
npm ci
npm run build
npm start
```

O projeto possui rotas de API e integrações no servidor, portanto precisa de uma hospedagem com suporte ao runtime Node.js do Next.js. As URLs públicas de aplicação e login devem apontar para o endereço de produção.

Variáveis com prefixo `NEXT_PUBLIC_` são incorporadas ao cliente durante o build; alterações nelas exigem um novo build.
