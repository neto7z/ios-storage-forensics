# Metodologia e limites

## Princípios adotados

1. **Medir antes de alterar.** O valor exibido pelos Ajustes do iOS foi tratado
   como pista, não como localização física do problema.
2. **Descer por níveis.** A investigação usou `du` progressivamente em
   `/private/var/mobile`, `Library` e `Caches`.
3. **Trabalhar no mesmo sistema de arquivos.** A opção `-x` evitou atravessar
   volumes montados e somar o mesmo espaço de maneira enganosa.
4. **Identificar o produtor.** O nome `com.google.photos.mdd.downloads` apareceu
   em todos os 242 conjuntos descartados.
5. **Validar a inatividade.** O aplicativo associado já não estava instalado e
   não havia um cache ativo correspondente nos contêineres.
6. **Restringir a mutação.** Somente o conteúdo de `discardedCaches` foi
   alcançado; o diretório do sistema permaneceu existente.
7. **Medir novamente.** `du` confirmou tamanho zero no alvo e `df` confirmou o
   aumento do espaço livre.

## Por que a primeira exclusão falhou

Mesmo com privilégios administrativos, os arquivos retornaram `Operation not
permitted`. Um teste em um único arquivo mostrou que a remoção das flags
imutáveis `uchg` e `schg` permitia a exclusão.

O procedimento final retirou essas flags somente dentro do caminho já validado.
Não foram alteradas permissões ou flags em `/private/var`, em contêineres ativos
ou na biblioteca de fotos.

## O que os números significam

O APFS compartilha espaço entre volumes. Por isso, as linhas de `df` não devem
ser somadas como se fossem discos independentes. O dado relevante foi o espaço
disponível antes e depois no mesmo conjunto de volumes.

Arquivos esparsos também exigem cuidado: `ls` pode mostrar um tamanho lógico
muito superior ao espaço físico indicado por `du`. O caso do cache de
`coresymbolicationd` exemplificou essa diferença.

## Limitações

- Não demonstra que todo crescimento de “Dados do Sistema” tenha a mesma causa.
- Não substitui backup nem reparo profissional.
- Depende de jailbreak e acesso autorizado ao sistema de arquivos.
- Não automatiza a remoção de Mobile Assets, bancos de dados, índices ou caches
  genéricos.
- Não garante compatibilidade com outras versões do iOS.

## Evidências preservadas no relato

Foram mantidos apenas valores agregados, nomes técnicos de serviços e comandos.
Foram excluídos do material público:

- nome do aparelho;
- UDID;
- conta Apple;
- senhas;
- serial da bateria;
- caminhos pessoais no computador;
- horários exatos de uso.
