import { pascalCase } from 'change-case-all';
import { Types } from '@graphql-codegen/plugin-helpers';
import {
  LoadedFragment,
  ClientSideBaseVisitor,
  ClientSideBasePluginConfig,
  DocumentMode,
  RawClientSideBasePluginConfig,
} from '@graphql-codegen/visitor-plugin-common';
import { GraphQLSchema, OperationDefinitionNode } from 'graphql';

interface TypeScriptDocumentNodesVisitorPluginConfig extends RawClientSideBasePluginConfig {
  addTypenameToSelectionSets?: boolean;
}

export class TypeScriptDocumentNodesVisitor extends ClientSideBaseVisitor<
  TypeScriptDocumentNodesVisitorPluginConfig,
  ClientSideBasePluginConfig
> {

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
  }

  public OperationDefinition(node: OperationDefinitionNode): string {
    const documentVariableName = this.getOperationVariableName(node);
    const operationType = pascalCase(node.operation);
    const operationTypeSuffix = this.getOperationSuffix(node, operationType);
    const operationVariablesTypes = this.convertName(node, {
      suffix: operationTypeSuffix + 'Variables',
    });
    const operationResultType = this.convertName(node, {
      suffix: operationTypeSuffix + this._parsedConfig.operationResultSuffix,
  });

    return `export type ${documentVariableName} = DocumentNode<${operationResultType}, ${operationVariablesTypes}>;`;
  }
}
