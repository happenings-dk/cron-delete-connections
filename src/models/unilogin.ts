import mongoose, { Schema, Document } from 'mongoose';

export interface IUniloginAuth extends Document {
    _id: string;
    state: string;
    verifier: string;
    isweb: boolean;
    createdat: {
        seconds: number;
        nanos: number;
    };
    isused: boolean;
    usedat?: Date | null;
    userid: string;
}

const UniloginAuthSchema = new Schema({
    state: { type: String, required: true },
    verifier: { type: String, required: true },
    isweb: { type: Boolean, default: false },
    createdat: {
        seconds: Number,
        nanos: Number
    },
    isused: { type: Boolean, default: false },
    usedat: { type: Date, default: null },
    userid: { type: String, required: true }
}, {
    collection: 'unilogins'
});

export const UniloginAuth = mongoose.model<IUniloginAuth>('UniloginAuth', UniloginAuthSchema);