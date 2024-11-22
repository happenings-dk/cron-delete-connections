import mongoose, { Schema, Document } from 'mongoose';

export interface IAuth extends Document {
    _id: string;
    state: string;
    verifier: string;
    isweb: boolean;
    createdat: {
        seconds: number;
        nanos: number;
    };
    isused: boolean;
    usedat: Date | null;
    userid: string;
}

const AuthSchema = new Schema({
    state: String,
    verifier: String,
    isweb: Boolean,
    createdat: {
        seconds: Number,
        nanos: Number
    },
    isused: Boolean,
    usedat: Date,
    userid: String
}, { collection: 'Unilogin.Auth' });

export const Auth = mongoose.model<IAuth>('Auth', AuthSchema);