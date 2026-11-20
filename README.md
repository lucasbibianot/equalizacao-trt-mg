# Simulador de equalização do TRT-MG

Aplicação estática para simular agrupamentos de Varas do Trabalho com base nos casos novos de conhecimento de 2025 e na quantidade de juízes.

## Uso local

Na raiz do projeto, rode o build e sirva os arquivos:

```bash
npm ci
npm run build
python3 -m http.server 8000 --directory dist
```

Abra [http://localhost:8000](http://localhost:8000). O simulador usa JavaScript no navegador e inclui uma base fictícia para demonstração. A aba **Base de varas** oferece o modelo de importação em Excel. CSV UTF-8 também é aceito.

## Critérios da simulação

- A média geral é a soma dos casos novos dividida pela soma dos juízes. A média de cada grupo usa o mesmo cálculo para as varas alocadas.
- Cada sugestão reúne pelo menos uma vara de alta e uma de baixa movimentação. A composição manual fica em montagem até atender às duas categorias e ao mínimo informado.
- O cenário aceita até nove grupos. A busca usa o intervalo informado de varas por grupo, com limite de 60.
- A faixa de referência é de 95% a 105% da média geral. A busca prioriza varas em grupos na faixa e minimiza os cruzamentos entre subregiões.
- A opção de manter juntas as varas da mesma cidade trata cada cidade como um bloco na sugestão e na alocação manual.

A base de varas e os cenários são guardados no Supabase e compartilhados entre os usuários cadastrados. O simulador exporta resultados em CSV e permite salvar e restaurar projetos em JSON.

## Acesso e configuração

- Configure o provedor Google em **Authentication → Sign In / Providers** no Supabase. Use um cliente OAuth do Google Workspace institucional, com público interno e o callback `https://xefqxxnuhyoghhqurkfs.supabase.co/auth/v1/callback`.
- Em **Authentication → URL Configuration**, configure o endereço do site e autorize o retorno OAuth ao mesmo endereço. Autorize o endereço local separadamente para testar em desenvolvimento.
- Cadastre o domínio confirmado em `equalizacao_private.settings.allowed_domain` e o primeiro e-mail, em minúsculas, em `public.equalizacao_members.email`. O cadastro do primeiro usuário pode ser feito na mesma transação da configuração do domínio.
- Os usuários cadastrados recebem o perfil **Padrão**, que permite editar o projeto e cadastrar outras contas institucionais. A tabela `equalizacao_roles` permite definir perfis com permissões diferentes quando necessário.
- Se o projeto compartilhado estiver vazio e houver dados locais, a opção **Publicar dados locais** envia a base e os cenários do navegador atual após confirmação. Também é possível exportar um JSON na versão anterior e restaurá-lo após a ativação.
