import mongoose, { Schema, Document } from 'mongoose';

export interface IConnection extends Document {
    _id: string;
    characterid: string;
    charactertype: number;
    organization: {
        id: string;
        name: string;
        country: number;
        image: {
            original: string;
            large: string;
            medium: string;
            small: string;
            tiny: string;
            createdat: Date | null;
        };
        searchtags: string[];
        emaildomain: string;
        uniloginid: string;
        wayfid: string;
    };
    data: string;
    createdat: {
        seconds: number;
        nanos: number;
    };
    method: number;
    status: number;
}

const ConnectionSchema = new Schema({
    characterid: String,
    charactertype: Number,
    organization: {
        id: String,
        name: String,
        country: Number,
        image: {
            original: String,
            large: String,
            medium: String,
            small: String,
            tiny: String,
            createdat: Date
        },
        searchtags: [String],
        emaildomain: String,
        uniloginid: String,
        wayfid: String
    },
    data: String,
    createdat: {
        seconds: Number,
        nanos: Number
    },
    method: Number,
    status: Number
}, { collection: 'Organization.Connections' });

export const Connection = mongoose.model<IConnection>('Connection', ConnectionSchema);