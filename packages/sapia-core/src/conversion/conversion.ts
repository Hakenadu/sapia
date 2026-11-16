import type { CoreMetamodels, DiagramModel } from '../metamodel';
import type { Disposable } from '../language/registry';

export interface ParseResult<M> {
  model: M;
  /** Human readable notes about constructs that could not be mapped. */
  warnings: string[];
}

/**
 * Maps one language to and from the metamodel of one diagram type.
 *
 * Conversion between languages never goes directly from A to B: the source
 * is parsed into the diagram type's metamodel and generated from there, so
 * supporting a new language for a type takes exactly one mapper.
 */
export interface ModelMapper<M extends DiagramModel = DiagramModel> {
  languageId: string;
  diagramType: string;
  parse(source: string): ParseResult<M>;
  generate(model: M): string;
}

export type CoreModelMapper<T extends keyof CoreMetamodels> = ModelMapper<CoreMetamodels[T]> & {
  diagramType: T;
};

export interface ConversionRequest {
  source: string;
  from: string;
  to: string;
  diagramType: string;
}

export interface ConversionResult {
  source: string;
  model: DiagramModel;
  warnings: string[];
}

export class ConversionError extends Error {
  constructor(
    message: string,
    readonly code: 'no-mapper' | 'parse-failed' | 'generate-failed',
  ) {
    super(message);
    this.name = 'ConversionError';
  }
}

export class ConversionService {
  private readonly mappers = new Map<string, ModelMapper<any>>();
  private readonly listeners = new Set<() => void>();

  private key(languageId: string, diagramType: string): string {
    return `${languageId}::${diagramType}`;
  }

  registerMapper<M extends DiagramModel>(mapper: ModelMapper<M>): Disposable {
    const key = this.key(mapper.languageId, mapper.diagramType);
    this.mappers.set(key, mapper);
    this.emit();
    return () => {
      if (this.mappers.get(key) === mapper) {
        this.mappers.delete(key);
        this.emit();
      }
    };
  }

  getMapper(languageId: string, diagramType: string): ModelMapper | undefined {
    return this.mappers.get(this.key(languageId, diagramType));
  }

  /** Languages the given source language can be converted to for a diagram type. */
  targetsFor(languageId: string, diagramType: string): string[] {
    if (!this.getMapper(languageId, diagramType)) return [];
    const targets: string[] = [];
    for (const mapper of this.mappers.values()) {
      if (mapper.diagramType === diagramType && mapper.languageId !== languageId) {
        targets.push(mapper.languageId);
      }
    }
    return targets;
  }

  canConvert(from: string, to: string, diagramType: string): boolean {
    return from !== to && !!this.getMapper(from, diagramType) && !!this.getMapper(to, diagramType);
  }

  /** Parses a source into the metamodel of its diagram type. */
  toModel(source: string, languageId: string, diagramType: string): ParseResult<DiagramModel> {
    const mapper = this.getMapper(languageId, diagramType);
    if (!mapper) {
      throw new ConversionError(`No mapper for ${languageId}/${diagramType}`, 'no-mapper');
    }
    try {
      return mapper.parse(source);
    } catch (e) {
      throw new ConversionError((e as Error).message, 'parse-failed');
    }
  }

  convert(request: ConversionRequest): ConversionResult {
    const target = this.getMapper(request.to, request.diagramType);
    if (!target) {
      throw new ConversionError(`No mapper for ${request.to}/${request.diagramType}`, 'no-mapper');
    }
    const { model, warnings } = this.toModel(request.source, request.from, request.diagramType);
    try {
      return { source: target.generate(model), model, warnings };
    } catch (e) {
      throw new ConversionError((e as Error).message, 'generate-failed');
    }
  }

  onChange(listener: () => void): Disposable {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}
