import mongoose, { Schema, Document } from 'mongoose';

export interface IOrganization extends Document {
    id: string;
    name: string;
    country: number;
    image: {
        original: string;
        large: string;
        medium: string;
        small: string;
        tiny: string;
    };
    uniloginid: string;
    wayfid: string;
    searchtags: string[];
    emaildomain: string;
}

const OrganizationSchema = new Schema({
    id: String,
    name: String,
    country: Number,
    image: {
        original: String,
        large: String,
        medium: String,
        small: String,
        tiny: String
    },
    uniloginid: String,
    wayfid: String,
    searchtags: [String],
    emaildomain: String
}, { collection: 'Organization.Organizations' });

export const Organization = mongoose.model<IOrganization>('Organization', OrganizationSchema);