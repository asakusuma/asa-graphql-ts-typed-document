import { pascalCase } from 'change-case-all';
import { Types } from '@graphql-codegen/plugin-helpers';
import {
  LoadedFragment,
  ClientSideBaseVisitor,
  ClientSideBasePluginConfig,
  DocumentMode,
  RawClientSideBasePluginConfig,
} from '@graphql-codegen/visitor-plugin-common';
import { DefinitionNode, GraphQLSchema, OperationDefinitionNode } from 'graphql';

interface TypeScriptDocumentNodesVisitorPluginConfig extends RawClientSideBasePluginConfig {
  addTypenameToSelectionSets?: boolean;
}

// This probably gonna be a perf bottleneck. Probably need to somehow ensure source file location is available
// natively in the visitor for the OperationDefinition method
function generateOperationToSourceMap(documents: Types.DocumentFile[]): Map<DefinitionNode, string> {
  const map = new Map<DefinitionNode, string>();
  documents.forEach((doc) => {
    const location = doc.location;
    if (location && doc.document && doc.document) {
      doc.document.definitions.forEach((def) => {
        map.set(def, location);
      });
    }
  });

  return map;
}

export class TypeScriptDocumentNodesVisitor extends ClientSideBaseVisitor<
  TypeScriptDocumentNodesVisitorPluginConfig,
  ClientSideBasePluginConfig
> {
  private docSourceMap: Map<DefinitionNode, string>;
  constructor(
    schema: GraphQLSchema,
    fragments: LoadedFragment[],
    config: TypeScriptDocumentNodesVisitorPluginConfig,
    documents: Types.DocumentFile[]
  ) {
    super(
      schema,
      fragments,
      {
        documentMode: DocumentMode.documentNodeImportFragments,
        documentNodeImport: '@graphql-typed-document-node/core#TypedDocumentNode',
        ...config,
      },
      {},
      documents
    );

    this.docSourceMap = generateOperationToSourceMap(documents);
  }

  private getOperationLocation(node: OperationDefinitionNode): string | undefined {
    return this.docSourceMap.get(node);
  }

  public OperationDefinition(node: OperationDefinitionNode): string {
    const documentVariableName = this.getOperationVariableName(node);
    const isAnonymousQuery = !(!!node.name);
    const operationType = pascalCase(node.operation);
    const operationTypeSuffix = this.getOperationSuffix(node, operationType);
    const operationVariablesTypes = this.convertName(node, {
      suffix: operationTypeSuffix + 'Variables',
    });
    const operationResultType = this.convertName(node, {
      suffix: operationTypeSuffix + this._parsedConfig.operationResultSuffix,
    });

    const source = this.getOperationLocation(node);
    if (isAnonymousQuery && source) {
      return generateModuleDeclaration(source, documentVariableName, {
          resultType: operationResultType,
          variablesType: node.variableDefinitions.length && operationVariablesTypes
      });
  } else if(!isAnonymousQuery) {
      const typeDef = `export type ${documentVariableName} = ${getDocumentType(operationResultType, node.variableDefinitions.length && operationVariablesTypes)};`;
      // TODO: do we allow multiple queries per file?
      const moduleDeclaration = source ? generateModuleDeclaration(source, documentVariableName) : '';
      return typeDef + '\n' + moduleDeclaration;
  }
  return '';
  }
}

interface QueryTypes {
  resultType: string;
  variablesType: string;
}

function getDocumentType(operationResultType: string, operationVariablesTypes?: string) {
  if (operationVariablesTypes) {
      return `DocumentNode<${operationResultType}, ${operationVariablesTypes}>`;
  }
  return `DocumentNode<${operationResultType}>`;
}

function generateModuleDeclaration(path: string, typeVariableName: string, localTypeNames?: QueryTypes) {
  if (localTypeNames) {
    return `
declare module '${path}' {
type AnonymousQueryType = ${getDocumentType(localTypeNames.resultType, localTypeNames.variablesType)};
export default AnonymousQueryType;
}
`;
}
  return `
declare module '${path}' {
  export default ${typeVariableName};
}
    `;
}
