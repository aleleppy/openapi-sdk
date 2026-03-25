import type { SchemaKind } from '../schema-classifier';
import type { FieldHandler } from './FieldHandler';
import type { TypeMapper } from '../TypeMapper';
import { PrimitiveFieldHandler } from './PrimitiveFieldHandler';
import { EnumFieldHandler } from './EnumFieldHandler';
import { ObjectFieldHandler } from './ObjectFieldHandler';
import { ArrayObjectFieldHandler } from './ArrayObjectFieldHandler';
import { ArrayEnumFieldHandler } from './ArrayEnumFieldHandler';
import { ArrayPrimitiveFieldHandler } from './ArrayPrimitiveFieldHandler';
import { UnionFieldHandler } from './UnionFieldHandler';
import { EmptyObjectFieldHandler } from './EmptyObjectFieldHandler';

export class FieldHandlerFactory {
  private readonly handlers: Record<SchemaKind, FieldHandler>;

  constructor(typeMapper: TypeMapper) {
    this.handlers = {
      primitive: new PrimitiveFieldHandler(typeMapper),
      enum: new EnumFieldHandler(typeMapper),
      object: new ObjectFieldHandler(),
      'array-object': new ArrayObjectFieldHandler(),
      'array-enum': new ArrayEnumFieldHandler(),
      'array-primitive': new ArrayPrimitiveFieldHandler(typeMapper),
      union: new UnionFieldHandler(typeMapper),
      'empty-object': new EmptyObjectFieldHandler(),
      unknown: new PrimitiveFieldHandler(typeMapper),
    };
  }

  get(kind: SchemaKind): FieldHandler {
    return this.handlers[kind];
  }
}
