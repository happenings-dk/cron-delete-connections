import mongoose, { Schema, Document } from 'mongoose';

export interface IAccess extends Document {
    _id: string;
    id: string;
    type: number;
    characterid: string;
}

const AccessSchema = new Schema({
    id: String,
    type: Number,
    characterid: String
}, { collection: 'Access.Access' });

export const Access = mongoose.model<IAccess>('Access', AccessSchema);