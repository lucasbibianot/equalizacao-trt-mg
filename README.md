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
- O máximo de agrupamentos é configurável de 1 a 100 por cenário, com 9 como padrão. A busca usa o intervalo informado de varas por grupo, com limite de 60.
- No modo por sub-região, todas as varas devem ser alocadas pela sugestão; no modo por distância, a alocação pode ser parcial e o saldo sem grupo é informado. A faixa de referência é de 95% a 105% da média geral. A busca prioriza varas em grupos na faixa e minimiza os cruzamentos entre subregiões.
- A opção de manter juntas as varas da mesma cidade trata cada cidade como um bloco na sugestão e na alocação manual.

A base de varas e os cenários são guardados no Supabase e compartilhados entre os usuários cadastrados. O simulador exporta resultados em CSV e permite salvar e restaurar projetos em JSON.

## Acesso e configuração

- Configure o provedor Google em **Authentication → Sign In / Providers** no Supabase. Use um cliente OAuth do Google Workspace institucional, com público interno e o callback `https://xefqxxnuhyoghhqurkfs.supabase.co/auth/v1/callback`.
- Em **Authentication → URL Configuration**, configure o endereço do site e autorize o retorno OAuth ao mesmo endereço. Autorize o endereço local separadamente para testar em desenvolvimento.
- Cadastre o domínio confirmado em `equalizacao_private.settings.allowed_domain` e o primeiro e-mail, em minúsculas, em `public.equalizacao_members.email`. O cadastro do primeiro usuário pode ser feito na mesma transação da configuração do domínio.
- Os usuários cadastrados recebem o perfil **Padrão**, que permite editar o projeto e cadastrar outras contas institucionais. A tabela `equalizacao_roles` permite definir perfis com permissões diferentes quando necessário.
- Se o projeto compartilhado estiver vazio e houver dados locais, a opção **Publicar dados locais** envia a base e os cenários do navegador atual após confirmação. Também é possível exportar um JSON na versão anterior e restaurá-lo após a ativação.

## Proximidade geográfica

Em **Sugerir agrupamentos**, escolha **Proximidade geográfica** e informe a distância máxima em km entre quaisquer duas cidades do grupo. As varas da mesma cidade permanecem juntas. O limite é aplicado também à alocação manual, à restauração JSON e à edição da base. Os parâmetros são compartilhados no mesmo payload do Supabase, sem migração de esquema.

A busca usa agrupamento hierárquico por ligação completa: compara uniões dos blocos mais próximos com uniões por ganho de cobertura na faixa, sempre respeitando o limiar e o tamanho máximo. Mantém a melhor composição intermediária de cada busca e escolhe pela cobertura na faixa, varas alocadas e compactação. O modo por distância aceita os grupos encontrados mesmo sem cobrir toda a base. Respeita o máximo de grupos informado, o tamanho permitido, ambas as categorias e o limiar entre todos os pares de cidades. Não executa a busca obrigatória de alocação integral nesse modo. O resultado informa quantas varas foram alocadas e quantas ficaram sem agrupamento; o aviso permanece na página enquanto houver varas sem grupo. O modo por sub-região continua usando a busca limitada de alocação integral (até 150.000 nós) e preserva o cenário atual quando não encontra uma composição completa.

A página de agrupamentos apresenta média e máxima das distâncias por sub-região e por grupo. A média usa todos os pares de cidades distintas (cada par uma vez), sem ponderação por varas. Uma cidade isolada não tem média entre cidades. Se faltarem coordenadas, a média é parcial e a máxima total não é apresentada.

Coordenadas: 853 sedes municipais de MG, snapshot de 23/11/2026 do repositório [Municípios Brasileiros](https://github.com/kelvins/municipios-brasileiros), licença MIT em `dist/municipalities-LICENSE.txt`. Distância em linha reta por Haversine (raio médio terrestre 6.371,0088 km); não é distância rodoviária. Nomes de municípios devem corresponder aos da base, desconsiderando acentos, maiúsculas e espaços extras. Municípios desconhecidos são sinalizados e ficam sem agrupamento na sugestão por distância, assim como cidades que excedam o tamanho máximo de grupo; suas varas não são excluídas da base. A base demonstrativa usa nomes fictícios.

Verificação: `node --test tests/*.test.mjs`.

## Busca sem bloquear a interface

A geração de sugestões roda em um Web Worker separado da interface. Cada tentativa cria seu próprio worker, encerrado ao concluir, falhar, cancelar ou atingir 20 segundos. Fechar o formulário cancela o cálculo. O formulário indica o processamento e libera os parâmetros para nova tentativa após erro. Nenhum resultado parcial, cancelado ou expirado é salvo; o modo por distância permite resultado parcial com aviso; o modo por sub-região exige alocação integral.


## Máximo de agrupamentos por cenário

Em **Sugerir agrupamentos**, o campo **Máximo de agrupamentos** aceita inteiros de 1 a 100, com padrão 9. O valor é usado pelas buscas por distância e por sub-região, fica salvo no cenário e é preservado ao duplicar e exportar/restaurar JSON. A criação manual e o contador de grupos respeitam o valor do cenário. Arquivos antigos sem o campo `maxGroups` assumem 9. Aumentar o máximo pode ampliar a cobertura, sem garantir alocação de todas as varas no modo por distância. O cálculo continua separado da interface e limitado a 20 segundos.
