# Segurança

## Modelo de uso

Os scripts deste repositório são destinados exclusivamente a aparelhos próprios
ou administrados com autorização expressa.

O diagnóstico é somente leitura. A limpeza:

- funciona em modo de simulação por padrão;
- exige privilégios administrativos;
- aceita apenas um caminho absoluto codificado no próprio script;
- recusa tipos de cache diferentes do caso documentado;
- exige confirmação textual antes de excluir;
- preserva o diretório de descarte do iOS.

## Acesso SSH

Não reutilize a senha da conta Apple, do código de desbloqueio ou de qualquer
outro serviço. Ao terminar:

1. troque a senha temporária do usuário `mobile`;
2. remova ou desative o OpenSSH Server;
3. encerre o encaminhamento `iproxy`.

## Relato de problema

Não abra uma issue contendo UDID, serial, e-mail, senha, endereço IP público ou
logs sem anonimização. Para falhas de segurança no código, use o recurso de
relato privado do GitHub, quando disponível.
