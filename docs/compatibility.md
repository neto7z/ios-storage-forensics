# Compatibilidade com iPhone e iOS

O aplicativo trabalha com duas camadas diferentes. A identificação USB e o
relatório técnico não dependem de jailbreak. A leitura do sistema de arquivos e
a limpeza validada dependem de um jailbreak compatível, OpenSSH ativo e
autorização do proprietário do aparelho.

## O que funciona sem jailbreak

- detecção e autorização do iPhone pelo cabo;
- identificação de `ProductType`, versão e build do iOS;
- identificação da família do chip quando o modelo é conhecido;
- leitura das informações de bateria que o próprio iOS disponibilizar;
- exportação de relatório sem UDID, serial, conta Apple ou credenciais.

Essa camada é o modo universal. Uma versão do iOS sem jailbreak público não
impede a identificação do aparelho.

## Como o acesso avançado é decidido

Depois da leitura USB, o aplicativo cruza `ProductType`, chip e versão do iOS
com as regras em [`src/compatibility.ts`](../src/compatibility.ts). A matriz foi
revisada em **24 de agosto de 2026** e usa somente os projetos oficiais abaixo:

| Método | Combinações representadas na matriz | Fonte |
| --- | --- | --- |
| Dopamine | faixas oficiais para arm64, arm64e e a exceção atual de A12/A13 | [opa334/Dopamine](https://github.com/opa334/Dopamine) |
| palera1n | aparelhos A8–A11 a partir do iOS 15, observadas as restrições do projeto | [palera1n/palera1n](https://github.com/palera1n/palera1n) |

A indicação significa apenas que existe um método público declarado como
compatível. Ela não garante sucesso, não substitui backup e não autoriza o
aplicativo a modificar o aparelho sozinho.

## Estados exibidos

- **Método encontrado:** há pelo menos um projeto oficial compatível na matriz.
- **Não disponível:** o diagnóstico básico funciona, mas não há método auditado
  para aquela combinação.
- **Verificação manual:** modelo, chip ou versão não puderam ser reconhecidos com
  segurança. O aplicativo não tenta adivinhar.

Um aparelho que já tenha jailbreak e OpenSSH pode usar a conexão avançada
existente. A senha fica apenas na memória durante a operação e não é incluída no
relatório.

## Limite técnico

Não existe um jailbreak universal. Cada método depende do hardware, da versão
do iOS e de falhas específicas. Por isso, o aplicativo nunca deve prometer
acesso profundo para uma combinação que ainda não possua solução pública. Novos
métodos devem ser adicionados à matriz com fonte oficial e testes de fronteira
antes da publicação de uma nova versão.
