# Registro de alteração — 23/11/2026

Correção do bloqueio da interface ao repetir a busca com outro limiar.

1. Inspeção do fluxo de sugestão e da busca de restrições: o cálculo síncrono ocupava a linha de execução da interface; o limite de nós não limitava o tempo de bloqueio.
2. Testes escritos antes da implementação: execução separada, resultado, falha seguida de nova tentativa, tempo limite, cancelamento e erro. Primeira execução falhou pela ausência do módulo a implementar.
3. Implementação do cliente e do Web Worker: mantém o algoritmo e suas restrições, isola o cálculo, encerra recursos por tentativa e impõe limite de 20 segundos. Não há fallback de cálculo síncrono.
4. Integração do formulário: mensagem de processamento, parâmetros temporariamente desabilitados, cancelamento ao fechar e liberação após erro. O salvamento acontece somente após sucesso.
5. Validação: 14 testes passaram, incluindo worker real com falha em 1 km seguida de sucesso em 250 km. A mesma sequência foi conferida no navegador com quatro varas de teste e persistência simulada; nenhuma alteração na base compartilhada foi feita durante a validação. Sintaxe e whitespace conferidos.
6. Limpeza dos dois arquivos temporários de validação antes do empacotamento. Publicação usa o fluxo do site existente e preserva seu acesso.

As ferramentas crapper, dryer e mutator não estão disponíveis nesta sessão. Foram usados testes comportamentais e revisão do diff. A base real do usuário não foi carregada nesta validação; não foi comprovada a viabilidade de agrupamento dessa base em 250 km.


## Sugestões parciais por distância — 23/11/2026

1. Atualizados os testes para permitir resultado parcial, ausência de grupos e cidades sem coordenadas ou acima do tamanho máximo. A execução anterior à implementação falhou nos três comportamentos alterados.
2. O modo por distância passou a usar diretamente os grupos geográficos encontrados, sem a busca de cobertura integral. Mantidas as restrições de distância, cidade inteira, tamanho e alta/baixa movimentação. O modo regional continua exigindo cobertura completa.
3. Incluídos contagem no resultado e aviso persistente na página para as varas sem agrupamento, com orientação para o filtro existente. Atualizados os textos do formulário e da metodologia.
4. Quinze testes passaram, incluindo o worker real e a nova tentativa após resultado vazio; sintaxe e whitespace conferidos.
5. Conferido no navegador com quatro varas de teste: em 25 km, um grupo com duas varas foi aplicado; o aviso identificou duas sem agrupamento e o filtro exibiu somente essas duas. Persistência simulada, sem alterar a base compartilhada. Arquivos temporários removidos antes de empacotar.


## Máximo de agrupamentos configurável — 23/11/2026

1. Escritos quatro testes antes da implementação, confirmando falhas do limite fixo: cobertura com dez cidades, cenário regional, persistência e validação de entrada.
2. Adicionado parâmetro por cenário `maxGroups`, padrão 9, inteiro entre 1 e 100. O valor orienta os algoritmos, limites de capacidade, criação manual, contador e duplicação. Arquivos antigos permanecem compatíveis.
3. Incluído o campo no formulário e no pedido enviado ao worker. Teste com worker real verifica limites de um e dois grupos.
4. Dezenove testes passaram, com verificação de sintaxe e whitespace. Base sintética com dez cidades: 18/20 varas com nove grupos; 20/20 com dez. Mantidas as regras de distância e a alocação parcial nesse modo.
5. No navegador, conferidos padrão 9, geração com máximo 12, contador “2 de 12” e reabertura do formulário preservando 12. Usada base de teste com persistência simulada; arquivos temporários removidos antes do empacotamento.

## Sincronização com GitHub — 23/11/2026

Publicação solicitada explicitamente pelo usuário. Conferido o estado de `origin/main` e preservados os arquivos próprios do repositório. Sincronizados os arquivos da versão publicada: filtro de varas sem grupo, sugestões parciais por distância, cálculo em worker e máximo de grupos parametrizável. Os 19 testes, a sintaxe do aplicativo e a verificação de whitespace passaram antes do commit e envio.


## Proximidade, vizinhança e teto interno — 23/11/2026

1. Testes escritos antes da implementação para cadeia conectada, mínimo de vizinhas por cidade, exceção de uma cidade, componentes desconectados e persistência/validação. A execução inicial falhou em três comportamentos novos.
2. Implementada rede conectada por proximidade com mínimo de vizinhas distintas e teto entre todos os pares. Grupos intermediários podem não cumprir o grau mínimo, mas não são selecionados antes de cumprir todas as regras. Alta e baixa movimentação permanecem obrigatórias nas sugestões.
3. Acrescentados os parâmetros ao formulário, worker, cenário, duplicação e exportações. Cenários antigos preservam o limite anterior. A mesma validação cobre sugestões, importação JSON e alocação manual.
4. A seleção passou a priorizar varas alocadas, depois cobertura na faixa e compactação. Mantidos o aviso de resultado parcial, cancelamento e limite de 20 segundos.
5. Conferidos os testes, a sintaxe e o diff; ferramentas crapper, dryer e mutator continuam indisponíveis nesta sessão.
6. No navegador, conferidos os três campos, sua persistência e a cadeia Belo Horizonte–Contagem–Betim com proximidade de 20 km, mínimo de uma vizinha e teto de 35 km. As três varas ficaram no mesmo grupo, com alta/baixa e distância máxima observada de 29,3 km. Base e persistência de teste; arquivos temporários removidos antes do empacotamento.


## Nomes geográficos por proximidade — 23/11/2026

1. Consultada a API oficial do IBGE para os 853 municípios de MG e suas 12 mesorregiões históricas. Dados associados por código IBGE, sem estimar regiões por coordenadas.
2. Escritos testes antes da implementação para nomes geográficos, cidade central, estabilidade com a ordem da entrada, transições entre regiões, limite de tamanho e persistência. Os dois testes novos falharam antes da alteração.
3. Implementado prefixo geográfico com cidade central por menor soma das distâncias entre municípios distintos. Mantida a numeração para diferenciar nomes iguais. Não alterada a regra de composição nem os nomes já salvos; documentado o recorte histórico.
4. Vinte e cinco testes passaram, com conferência de sintaxe e whitespace. A página de metodologia e o README registram a origem e o critério de escolha dos nomes.

## Geração de PDF como funcionalidade — 23/11/2026

1. Esclarecido o escopo: exportação pelo aplicativo, usando a base e o cenário ativos, e não apenas entrega de um arquivo pronto.
2. Escritos testes antes da implementação para composição do relatório, troca de cenário, ausência de alterações na base, dados demonstrativos e emissão paginada. A execução inicial falhou pela ausência dos módulos a implementar.
3. Incluídos botão Gerar PDF, snapshot da base/revisão no clique, worker separado da interface com limite de 60 segundos e recuperação após erro. Relatório com três partes, dados completos independentemente dos filtros e identificação de grupos em montagem.
4. Instaladas versões fixas de jsPDF 4.2.1 e AutoTable 5.0.9, com lockfile. Fontes DejaVu locais preservam acentos, com licenças distribuídas. O build gera o worker pronto para servir, sem dependências externas de execução.
5. Trinta e um testes passaram. Build, sintaxe e whitespace conferidos. PDF da funcionalidade inspecionado por renderização de todas as páginas; corrigida a paginação para manter composições usuais juntas. Extração de texto e totais conferidos com a base da revisão 165, apenas para validação local, sem incluir dados reais no código.
6. No navegador, o botão baixou o PDF com uma base de quatro varas. Com o filtro Sem agrupamento exibindo apenas duas, o PDF manteve as quatro e o cenário selecionado. Arquivo baixado lido e conferido. Base/persistência simuladas; nenhum dado compartilhado foi alterado. Removidos os arquivos temporários do checkout antes da publicação.
7. Crapper, dryer e mutator indisponíveis; realizada revisão do diff e testes comportamentais.


## Região geográfica no cadastro e intercâmbio — 23/11/2026

1. Testes escritos antes da implementação para preenchimento por município, separação da sub-região judicial, informação manual, incompatibilidade, arquivos antigos e round-trip CSV/JSON. Execução inicial falhou pela ausência da nova exportação.
2. Adicionado geographicRegion ao modelo, cadastro e tabelas de varas, inclusive na alocação manual e na busca. Municípios identificados usam a referência histórica do IBGE existente; cidades desconhecidas aceitam região manual, sem estimativa.
3. Atualizadas importação CSV/XLSX, exportação CSV/JSON, migração de backups e relatório PDF. Modelo Excel recebeu a sétima coluna opcional e orientação, preservando as 500 fórmulas da coluna F. Conferidos cabeçalhos, fórmulas e renderização da planilha.
4. Os 35 testes passaram; build e sintaxe conferidos. PDF gerado com a base de validação local: regiões presentes, 15 páginas renderizadas e inspecionadas. Nenhum dado real incluído no repositório. Revisado o diff; whitespace do bundle gerado pertence a strings da dependência, sem alteração manual.
5. Crapper, dryer e mutator indisponíveis nesta sessão. Commit e push na main autorizados explicitamente pelo usuário após os testes.


## Vínculos manuais e recomendação por média — 23/11/2026

1. Revisada a validação de atribuição e restauração: retirar apenas a verificação no clique não seria suficiente, pois a validação do projeto bloquearia salvar/reabrir. Identificada também a restrição de conectividade que impediria incluir uma cidade isolada.
2. Escritos testes antes do código para vínculo distante, persistência, separação da sugestão automática, remoção de cidade intermediária e recomendação por média. Execução inicial falhou pela ausência de recommendedGroups.
3. Ajustes manuais registram exceção geográfica nos grupos alterados; preservados tamanho, cidade inteira e indicador de composição alta/baixa. Exceção validada como booleana, persistida em JSON/base e indicada na tela, no CSV e no PDF. Sugestões automáticas continuam estritas, sem herdar exceções.
4. Opções ordenadas pela média ponderada atual, crescente para alta e decrescente para baixa; vazios ao final, sem mutação ou atribuição automática. Incluídos testes de capacidade, cidade inteira e composição incompleta. Atualizados os testes antigos cujas expectativas de bloqueio manual foram substituídas pelo requisito atual.
5. Os 39 testes passaram, incluindo worker real e PDF. Build, sintaxe e diff conferidos. Crapper, dryer e mutator indisponíveis na sessão. Não realizada nova verificação no navegador.
6. Alteração preparada em commit local. Push na main e publicação aguardam autorização, conforme preferência expressa do usuário de perguntar antes de novo push na main.

7. Usuário autorizou expressamente o push e a publicação na resposta “Sim”.


## 24/11/2026 — Desbloqueio de ajustes manuais e cenários parciais
1. Reproduzidos com testes os bloqueios por tamanho no ajuste manual e por cobertura integral na sugestão regional.
2. Removida a exigência de cobertura integral na sugestão regional, preservando as restrições automáticas e sinalizando varas sem grupo em ambos os modos.
3. Ajustes manuais preservam a cidade inteira, dispensam geografia e tamanho máximo; manualSize persiste a exceção de tamanho no JSON e na duplicação, com validação de tipo.
4. Atualizados textos da interface, documentação e PDF. Testes abrangem salvamento/restauração, limites automáticos, cidade grande, região isolada e resultado vazio.
5. Verificação: 40 testes passaram; build e sintaxe da aplicação conferidos. Whitespace dos arquivos editados conferido; o bundle PDF contém whitespace emitido pela dependência. Sem verificação em navegador nesta etapa.
6. Alterações preparadas em commit local; push na main aguarda autorização conforme preferência registrada do usuário.

## 24/11/2026 — Gráfico após alocação manual
1. Identificados filtros que ocultavam grupos incompletos e grupos intermediários quando havia mais de 12. O salvamento já recalculava o relatório e redesenhava a tela.
2. Extraída a renderização do gráfico para teste, reproduzidas as duas omissões antes da correção. Agora todos os grupos com média aparecem, com indicação de montagem e marcador neutro para composição incompleta.
3. Verificados vínculos e remoções manuais: vazio → 150% em montagem → 100% completo → 50% em montagem → vazio. Incluída cobertura para 15 grupos.

## 24/11/2026 — Largura da coluna de distâncias
1. A classe num impunha white-space: nowrap também às notas extensas de distância, conectividade e exceções manuais, expandindo a coluna.
2. Coluna recebeu largura delimitada e quebra de texto nas notas; valores numéricos permanecem juntos. A regra vale também para a tabela de comparação.
3. Conferidas sintaxe JavaScript e whitespace. Alteração visual sem novos testes de implementação; publicação aguarda autorização.
