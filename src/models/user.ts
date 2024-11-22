import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
    id: string;
    email: string;
    firstname: string;
    familyname: string;
    fullname: string;
    institutionconnections: string[];
    uniloginid?: string;
    birthday?: {
        seconds: number;
        nanos: number;
    };
    unverifiedbirthday?: {
        seconds: number;
        nanos: number;
    };
    gender?: number;
    profileimage?: {
        original: string;
        large: string;
        medium: string;
        small: string;
        tiny: string;
    };
    isdeleted?: boolean;
    wayfid?: string;
    createdat?: {
        seconds: number;
        nanos: number;
    };
    updatedat?: {
        seconds: number;
        nanos: number;
    };
}

const UserSchema = new Schema({
    id: { type: String, required: true },
    email: String,
    firstname: String,
    familyname: String,
    fullname: String,
    birthday: {
        seconds: Number,
        nanos: Number
    },
    unverifiedbirthday: {
        seconds: Number,
        nanos: Number
    },
    gender: Number,
    institutionconnections: [String],
    uniloginid: String,
    profileimage: {
        original: String,
        large: String,
        medium: String,
        small: String,
        tiny: String
    },
    isdeleted: Boolean,
    wayfid: String,
    createdat: {
        seconds: Number,
        nanos: Number
    },
    updatedat: {
        seconds: Number,
        nanos: Number
    }
}, { collection: 'users' });

export const User = mongoose.model<IUser>('User', UserSchema);
